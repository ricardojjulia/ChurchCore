-- S5 (Council Reviews 18, 21, 22): members can't promote themselves, and
-- /hq is platform-staff only.
--
-- 1. Self-edit lock. authenticated holds a table-wide UPDATE grant on
--    profiles, and profiles_update_self lets anyone update their own row, so a
--    member could set their own role, church_id, user_id, membership status,
--    data-rights approval, pastoral flag or safety clearance through PostgREST.
--    Column grants can't close this (managers edit the same columns through
--    the same role), so a trigger refuses a change to these columns on your
--    own profile unless you manage that church. Server-side admin writes run
--    without a user (auth.uid() is null) and aren't affected.
--
-- 2. current_user_role() read profiles.role, which a member could set, and
--    which can't even say "secretary" (the enum has no such value, so the
--    membership snapshot collapses it to member_volunteer — the profile-role
--    drift Council Review 18 found). It now reads church_memberships, the
--    source of truth everywhere else. profiles.role is informational only.
--
-- 3. /hq ("Project HQ") is ChurchCore's internal project dashboard, not a
--    church feature, yet every church's admins could read and edit it across
--    all churches. Its tables are now platform-admin only (owner decision
--    2026-09-30).

-- ── 1. Self-edit lock ───────────────────────────────────────────────────────

create or replace function public.profiles_block_protected_self_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
     or old.user_id is distinct from auth.uid()
     or public.is_platform_admin()
     or (old.church_id is not null and public.can_manage_church(old.church_id)) then
    return new;
  end if;

  if new.role is distinct from old.role
     or new.church_id is distinct from old.church_id
     or new.user_id is distinct from old.user_id
     or new.membership_status is distinct from old.membership_status
     or new.data_delete_approved_at is distinct from old.data_delete_approved_at
     or new.data_delete_approved_by is distinct from old.data_delete_approved_by
     or new.is_pastoral is distinct from old.is_pastoral
     or new.safety_clearance_date is distinct from old.safety_clearance_date
     or new.merged_into_profile_id is distinct from old.merged_into_profile_id
     or new.merged_at is distinct from old.merged_at
     or new.member_number is distinct from old.member_number then
    raise exception 'You can''t change that on your own profile. Ask a church administrator.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_block_protected_self_edit on public.profiles;
create trigger profiles_block_protected_self_edit
  before update on public.profiles
  for each row execute function public.profiles_block_protected_self_edit();

-- ── 2. current_user_role() reads memberships ────────────────────────────────

create or replace function public.current_user_role()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
  v_profile_id uuid;
begin
  if public.is_platform_admin() then
    return 'admin';
  end if;

  -- The person's strongest active membership role (a login has one profile,
  -- and memberships are the source of truth for roles).
  select membership.role::text into v_role
  from public.church_memberships membership
  where membership.user_id = auth.uid()
    and membership.is_active
  order by case membership.role::text
    when 'church_admin' then 1
    when 'pastor' then 2
    when 'secretary' then 3
    when 'ministry_leader' then 4
    else 5
  end
  limit 1;

  if v_role = 'church_admin' then
    return 'admin';
  elsif v_role in ('pastor', 'secretary', 'ministry_leader') then
    return 'manager';
  elsif v_role is not null then
    select id into v_profile_id from public.profiles where user_id = auth.uid() limit 1;
    if exists (
      select 1 from public.ccm_volunteer_assignments
      where profile_id = v_profile_id and role = 'lead_teacher'
    ) then
      return 'teacher';
    end if;
    return 'member';
  end if;

  return 'member';
end;
$$;

-- ── 3. /hq is platform-admin only ───────────────────────────────────────────

do $$
declare
  t text;
  p record;
begin
  foreach t in array array['hq_tasks', 'hq_risks', 'hq_decisions', 'hq_sessions'] loop
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
  end loop;
end;
$$;

create policy "hq_tasks: platform admins" on public.hq_tasks
  for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "hq_risks: platform admins" on public.hq_risks
  for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "hq_decisions: platform admins" on public.hq_decisions
  for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "hq_sessions: platform admins, own sessions" on public.hq_sessions
  for all to authenticated
  using (public.is_platform_admin() and user_id = auth.uid())
  with check (public.is_platform_admin() and user_id = auth.uid());
