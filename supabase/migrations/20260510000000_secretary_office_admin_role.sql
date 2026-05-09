-- Secretary / Office Admin role for Daily Desk without broad church-admin access.

alter type public.app_role add value if not exists 'secretary';

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (
    role is null
    or role in (
      'church_admin',
      'secretary',
      'pastor_elder',
      'ministry_leader',
      'member_volunteer'
    )
  );

create or replace function public.can_access_daily_desk(target_church uuid)
returns boolean
language sql
stable
as $$
  select
    public.is_platform_admin()
    or exists (
      select 1
      from public.church_memberships membership
      where membership.church_id = target_church
        and membership.user_id = auth.uid()
        and membership.is_active
        and membership.role::text in ('church_admin', 'secretary', 'pastor')
    );
$$;

drop policy if exists "profiles_select_daily_desk_scope" on public.profiles;
create policy "profiles_select_daily_desk_scope"
on public.profiles
for select
to authenticated
using (
  church_id is not null
  and public.can_access_daily_desk(church_id)
);

drop policy if exists "daily_work_items_select_scope" on public.daily_work_items;
create policy "daily_work_items_select_scope"
  on public.daily_work_items for select
  to authenticated
  using (public.can_access_daily_desk(church_id));

drop policy if exists "daily_work_items_insert_scope" on public.daily_work_items;
create policy "daily_work_items_insert_scope"
  on public.daily_work_items for insert
  to authenticated
  with check (public.can_access_daily_desk(church_id));

drop policy if exists "daily_work_items_update_scope" on public.daily_work_items;
create policy "daily_work_items_update_scope"
  on public.daily_work_items for update
  to authenticated
  using (public.can_access_daily_desk(church_id))
  with check (public.can_access_daily_desk(church_id));

drop policy if exists "daily_work_items_delete_scope" on public.daily_work_items;
create policy "daily_work_items_delete_scope"
  on public.daily_work_items for delete
  to authenticated
  using (public.can_access_daily_desk(church_id));
