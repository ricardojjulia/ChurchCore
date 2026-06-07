-- Fix infinite recursion in group_members RLS policies.
--
-- The select and manage_leader policies both contained subqueries against
-- group_members itself. PostgreSQL re-evaluates the policy for every row in
-- the subquery, which calls the subquery again, causing infinite recursion.
--
-- Fix: introduce a security-definer helper that queries group_members without
-- RLS, then reference it in both policies.

create or replace function public.current_user_leader_group_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select gm.group_id
  from public.group_members gm
  join public.profiles p on p.id = gm.profile_id
  where p.user_id = auth.uid()
    and gm.role in ('leader', 'co_leader')
$$;

-- Rebuild select policy without self-referential subquery
drop policy if exists "group_members_select" on public.group_members;
create policy "group_members_select"
  on public.group_members for select
  to authenticated
  using (
    profile_id = (select id from public.profiles where user_id = auth.uid() limit 1)
    or group_id in (select public.current_user_leader_group_ids())
    or public.can_manage_church(church_id)
  );

-- Rebuild manage_leader policy without self-referential subquery
drop policy if exists "group_members_manage_leader" on public.group_members;
create policy "group_members_manage_leader"
  on public.group_members for insert
  to authenticated
  with check (
    group_id in (select public.current_user_leader_group_ids())
  );
