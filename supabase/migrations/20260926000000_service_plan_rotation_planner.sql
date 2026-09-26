-- Service Planning Story 3: rotation planner.
--
-- 1. volunteer_profiles.max_services_per_month: an admin-set cap on how often
--    a volunteer is scheduled (null = no cap). Used as a hard limit by the
--    rotation planner's suggestions.
-- 2. get_volunteer_pool(): one aggregated, church-scoped read of everything
--    the assignment picker and rotation planner rank on. SECURITY INVOKER, so
--    the caller's RLS applies to every table it reads. Set-based (one grouped
--    pass per table), not correlated subqueries per profile.
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

-- Shifts are read per church and per volunteer by both functions below and by
-- assignVolunteerAction's same-day conflict check.
create index if not exists volunteer_shifts_church_assignee_starts_idx
  on public.volunteer_shifts (church_id, assigned_user_id, starts_at);

-- Return types changed while this story was in review; drop so a re-applied
-- local migration can recreate them.
drop function if exists public.get_volunteer_pool(uuid, date, uuid);
drop function if exists public.get_volunteer_directory(uuid, integer);

create function public.get_volunteer_pool(
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
  is_volunteer boolean,
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
  -- One pass over the church's shifts, grouped per volunteer. Non-declined
  -- shifts count toward load, history and same-day conflicts.
  with shift_stats as (
    select
      vs.assigned_user_id as profile_id,
      bool_or(vs.starts_at::date = p_service_date) as serving_on_date,
      count(*) filter (
        where vs.starts_at >= (p_service_date - interval '30 days')
          and vs.starts_at < (p_service_date + interval '1 day')
      )::int as recent_shift_count,
      count(*) filter (
        where date_trunc('month', vs.starts_at) = date_trunc('month', p_service_date::timestamp)
      )::int as month_shift_count,
      max(vs.starts_at) filter (where vs.starts_at < p_service_date::timestamp) as last_served_at,
      count(*) filter (
        where p_role_type_id is not null and spp.role_type_id = p_role_type_id
      )::int as role_served_count
    from public.volunteer_shifts vs
    left join public.service_plan_positions spp on spp.id = vs.position_id
    where vs.church_id = p_church_id
      and vs.assigned_user_id is not null
      and vs.confirmation_status <> 'declined'
    group by vs.assigned_user_id
  ),
  -- Anyone ever scheduled, declined included, has volunteered before.
  ever_scheduled as (
    select distinct vs.assigned_user_id as profile_id
    from public.volunteer_shifts vs
    where vs.church_id = p_church_id and vs.assigned_user_id is not null
  ),
  hours as (
    select vhl.profile_id, sum(vhl.hours) as total_hours
    from public.volunteer_hours_log vhl
    where vhl.church_id = p_church_id
    group by vhl.profile_id
  ),
  blocked as (
    select vbd.profile_id
    from public.volunteer_blocked_dates vbd
    where vbd.church_id = p_church_id and vbd.blocked_date = p_service_date
  )
  select
    p.id,
    p.full_name,
    p.email,
    p.phone,
    coalesce(vp.skills, '{}'::text[]),
    vp.max_services_per_month,
    (vp.id is not null or es.profile_id is not null),
    (b.profile_id is not null),
    coalesce(ss.serving_on_date, false),
    coalesce(ss.recent_shift_count, 0),
    coalesce(ss.month_shift_count, 0),
    ss.last_served_at,
    coalesce(ss.role_served_count, 0),
    coalesce(h.total_hours, 0)
  from public.profiles p
  left join public.volunteer_profiles vp on vp.user_id = p.id and vp.church_id = p_church_id
  left join shift_stats ss on ss.profile_id = p.id
  left join ever_scheduled es on es.profile_id = p.id
  left join hours h on h.profile_id = p.id
  left join blocked b on b.profile_id = p.id
  where p.church_id = p_church_id
    and p.merged_into_profile_id is null
  order by p.full_name;
$$;

revoke execute on function public.get_volunteer_pool(uuid, date, uuid) from public, anon;
grant execute on function public.get_volunteer_pool(uuid, date, uuid) to authenticated;

-- 3. get_volunteer_directory(): the volunteer directory's data in one
--    church-scoped read. Replaces a PostgREST query that filtered on an
--    un-embedded church_memberships relation, which errored in production and
--    left the directory empty. Volunteers are people with a volunteer profile
--    or any shift. SECURITY INVOKER, so the caller's RLS applies.
create function public.get_volunteer_directory(
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
  with shift_stats as (
    select
      vs.assigned_user_id as profile_id,
      count(*) filter (
        where vs.confirmation_status = 'confirmed'
          and vs.starts_at >= make_date(p_year, 1, 1)
          and vs.starts_at < make_date(p_year + 1, 1, 1)
      )::int as shifts_this_year,
      max(vs.starts_at) filter (
        where vs.confirmation_status <> 'declined' and vs.starts_at <= now()
      ) as last_served_date
    from public.volunteer_shifts vs
    where vs.church_id = p_church_id and vs.assigned_user_id is not null
    group by vs.assigned_user_id
  ),
  hours as (
    select vhl.profile_id, sum(vhl.hours) as total_hours
    from public.volunteer_hours_log vhl
    where vhl.church_id = p_church_id
      and vhl.service_date >= make_date(p_year, 1, 1)
      and vhl.service_date < make_date(p_year + 1, 1, 1)
    group by vhl.profile_id
  )
  select
    p.id,
    p.full_name,
    p.email,
    p.phone,
    coalesce(vp.skills, '{}'::text[]),
    vp.max_services_per_month,
    coalesce(h.total_hours, 0),
    coalesce(ss.shifts_this_year, 0),
    ss.last_served_date,
    p.safety_clearance_date
  from public.profiles p
  left join public.volunteer_profiles vp on vp.user_id = p.id and vp.church_id = p_church_id
  left join shift_stats ss on ss.profile_id = p.id
  left join hours h on h.profile_id = p.id
  where p.church_id = p_church_id
    and p.merged_into_profile_id is null
    and (vp.id is not null or ss.profile_id is not null)
  order by p.full_name;
$$;

revoke execute on function public.get_volunteer_directory(uuid, integer) from public, anon;
grant execute on function public.get_volunteer_directory(uuid, integer) to authenticated;
