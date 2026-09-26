-- Service Planning Story 3: rotation planner.
--
-- 1. volunteer_profiles.max_services_per_month: an admin-set cap on how often
--    a volunteer is scheduled (null = no cap). Used as a hard limit by the
--    rotation planner's suggestions.
-- 2. get_volunteer_pool(): one aggregated, church-scoped read of everything
--    the assignment picker and rotation planner rank on. SECURITY INVOKER, so
--    the caller's RLS applies to every table it reads.
--
-- The pool is every non-merged profile in the church, not only people with an
-- app login (church_memberships): volunteers are scheduled and confirm by
-- emailed link without needing an account.

alter table public.volunteer_profiles
  add column if not exists max_services_per_month integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'volunteer_profiles_max_services_per_month_check'
  ) then
    alter table public.volunteer_profiles
      add constraint volunteer_profiles_max_services_per_month_check
      check (max_services_per_month is null or max_services_per_month between 1 and 31);
  end if;
end $$;

create or replace function public.get_volunteer_pool(
  p_church_id uuid,
  p_service_date date,
  p_role_type_id uuid default null
)
returns table (
  profile_id uuid,
  full_name text,
  email text,
  phone text,
  skills text[],
  max_services_per_month integer,
  is_blocked boolean,
  serving_on_date boolean,
  recent_shift_count integer,
  month_shift_count integer,
  last_served_at timestamptz,
  role_served_count integer,
  total_hours numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with shifts as (
    -- Non-declined shifts count toward load, history and conflicts.
    select vs.assigned_user_id, vs.starts_at, vs.position_id
    from public.volunteer_shifts vs
    where vs.church_id = p_church_id
      and vs.assigned_user_id is not null
      and coalesce(vs.confirmation_status, 'pending') <> 'declined'
  )
  select
    p.id,
    p.full_name,
    p.email,
    p.phone,
    coalesce(vp.skills, '{}'::text[]),
    vp.max_services_per_month,
    exists (
      select 1 from public.volunteer_blocked_dates vbd
      where vbd.church_id = p_church_id and vbd.profile_id = p.id and vbd.blocked_date = p_service_date
    ),
    exists (
      select 1 from shifts s
      where s.assigned_user_id = p.id and s.starts_at::date = p_service_date
    ),
    (
      select count(*)::int from shifts s
      where s.assigned_user_id = p.id
        and s.starts_at >= (p_service_date - interval '30 days')
        and s.starts_at < (p_service_date + interval '1 day')
    ),
    (
      select count(*)::int from shifts s
      where s.assigned_user_id = p.id
        and date_trunc('month', s.starts_at) = date_trunc('month', p_service_date::timestamp)
    ),
    (
      select max(s.starts_at) from shifts s
      where s.assigned_user_id = p.id and s.starts_at < p_service_date::timestamp
    ),
    (
      select count(*)::int from shifts s
      join public.service_plan_positions spp on spp.id = s.position_id
      where s.assigned_user_id = p.id
        and p_role_type_id is not null
        and spp.role_type_id = p_role_type_id
    ),
    coalesce((
      select sum(vhl.hours) from public.volunteer_hours_log vhl
      where vhl.church_id = p_church_id and vhl.profile_id = p.id
    ), 0)
  from public.profiles p
  left join public.volunteer_profiles vp on vp.user_id = p.id and vp.church_id = p_church_id
  where p.church_id = p_church_id
    and p.merged_into_profile_id is null
  order by p.full_name;
$$;

grant execute on function public.get_volunteer_pool(uuid, date, uuid) to authenticated;

-- 3. get_volunteer_directory(): the volunteer directory's data in one
--    church-scoped read. Replaces a PostgREST query that filtered on an
--    un-embedded church_memberships relation, which errored in production and
--    left the directory empty. Volunteers are people with a volunteer profile
--    or any shift. SECURITY INVOKER, so the caller's RLS applies.
create or replace function public.get_volunteer_directory(
  p_church_id uuid,
  p_year integer
)
returns table (
  profile_id uuid,
  full_name text,
  email text,
  phone text,
  skills text[],
  max_services_per_month integer,
  total_hours numeric,
  shifts_this_year integer,
  last_served_date timestamptz,
  background_check_date date
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    p.id,
    p.full_name,
    p.email,
    p.phone,
    coalesce(vp.skills, '{}'::text[]),
    vp.max_services_per_month,
    coalesce((
      select sum(vhl.hours) from public.volunteer_hours_log vhl
      where vhl.church_id = p_church_id and vhl.profile_id = p.id
        and extract(year from vhl.service_date) = p_year
    ), 0),
    (
      select count(*)::int from public.volunteer_shifts vs
      where vs.church_id = p_church_id and vs.assigned_user_id = p.id
        and vs.confirmation_status = 'confirmed'
        and extract(year from vs.starts_at) = p_year
    ),
    (
      select max(vs.starts_at) from public.volunteer_shifts vs
      where vs.church_id = p_church_id and vs.assigned_user_id = p.id
        and coalesce(vs.confirmation_status, 'pending') <> 'declined'
        and vs.starts_at <= now()
    ),
    p.safety_clearance_date
  from public.profiles p
  left join public.volunteer_profiles vp on vp.user_id = p.id and vp.church_id = p_church_id
  where p.church_id = p_church_id
    and p.merged_into_profile_id is null
    and (
      vp.id is not null
      or exists (
        select 1 from public.volunteer_shifts vs
        where vs.church_id = p_church_id and vs.assigned_user_id = p.id
      )
    )
  order by p.full_name;
$$;

grant execute on function public.get_volunteer_directory(uuid, integer) to authenticated;
