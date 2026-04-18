-- ============================================================
-- Volunteer Scheduling Module
-- Extends the existing volunteer_shifts / volunteer_profiles
-- tables with service plan grouping, confirmation workflow,
-- position templates, blocked dates, and hours tracking.
-- ============================================================

-- ------------------------------------------------------------
-- 1. service_plans — a specific service instance
-- ------------------------------------------------------------

create table if not exists public.service_plans (
  id          uuid        primary key default gen_random_uuid(),
  church_id   uuid        not null references public.churches (id) on delete cascade,
  event_id    uuid        references public.events (id) on delete set null,
  name        text        not null,
  service_date date       not null,
  service_time time,
  status      text        not null default 'draft',
  notes       text,
  created_by  uuid        references public.profiles (id) on delete set null,
  created_at  timestamptz not null default timezone('utc', now()),
  updated_at  timestamptz not null default timezone('utc', now())
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'service_plans_status_check') then
    alter table public.service_plans
      add constraint service_plans_status_check
      check (status in ('draft', 'published', 'complete', 'cancelled'));
  end if;
end $$;

create index if not exists service_plans_church_id_idx   on public.service_plans (church_id);
create index if not exists service_plans_service_date_idx on public.service_plans (service_date desc);

alter table public.service_plans enable row level security;

create policy "service_plans_manage"
  on public.service_plans for all
  to authenticated
  using (public.can_manage_church(church_id))
  with check (public.can_manage_church(church_id));

create policy "service_plans_select_member"
  on public.service_plans for select
  to authenticated
  using (public.belongs_to_church(church_id));

-- ------------------------------------------------------------
-- 2. service_plan_positions — required roles per plan
-- ------------------------------------------------------------

create table if not exists public.service_plan_positions (
  id              uuid  primary key default gen_random_uuid(),
  plan_id         uuid  not null references public.service_plans (id) on delete cascade,
  church_id       uuid  not null references public.churches (id) on delete cascade,
  role_name       text  not null,
  quantity_needed int   not null default 1,
  ministry_id     uuid  references public.ministries (id) on delete set null,
  sort_order      int   not null default 0
);

create index if not exists spp_plan_id_idx    on public.service_plan_positions (plan_id);
create index if not exists spp_church_id_idx  on public.service_plan_positions (church_id);

alter table public.service_plan_positions enable row level security;

create policy "spp_manage"
  on public.service_plan_positions for all
  to authenticated
  using (public.can_manage_church(church_id))
  with check (public.can_manage_church(church_id));

create policy "spp_select_member"
  on public.service_plan_positions for select
  to authenticated
  using (public.belongs_to_church(church_id));

-- ------------------------------------------------------------
-- 3. Extend volunteer_shifts with plan linkage + confirmation
-- ------------------------------------------------------------

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'volunteer_shifts' and column_name = 'plan_id'
  ) then
    alter table public.volunteer_shifts
      add column plan_id       uuid references public.service_plans (id) on delete set null,
      add column position_id   uuid references public.service_plan_positions (id) on delete set null,
      add column confirmation_status text not null default 'pending',
      add column decline_reason      text,
      add column responded_at        timestamptz,
      add column volunteer_notes     text;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'volunteer_shifts_confirmation_check') then
    alter table public.volunteer_shifts
      add constraint volunteer_shifts_confirmation_check
      check (confirmation_status in ('pending', 'confirmed', 'declined', 'substitute'));
  end if;
end $$;

create index if not exists volunteer_shifts_plan_id_idx on public.volunteer_shifts (plan_id);

-- ------------------------------------------------------------
-- 4. volunteer_blocked_dates — unavailability windows
-- ------------------------------------------------------------

create table if not exists public.volunteer_blocked_dates (
  id          uuid        primary key default gen_random_uuid(),
  church_id   uuid        not null references public.churches (id) on delete cascade,
  profile_id  uuid        not null references public.profiles (id) on delete cascade,
  blocked_date date       not null,
  reason      text,
  created_at  timestamptz not null default timezone('utc', now()),
  unique (profile_id, blocked_date)
);

create index if not exists vbd_profile_id_idx on public.volunteer_blocked_dates (profile_id);
create index if not exists vbd_church_id_idx  on public.volunteer_blocked_dates (church_id);

alter table public.volunteer_blocked_dates enable row level security;

create policy "vbd_manage"
  on public.volunteer_blocked_dates for all
  to authenticated
  using (public.can_manage_church(church_id))
  with check (public.can_manage_church(church_id));

create policy "vbd_own"
  on public.volunteer_blocked_dates for all
  to authenticated
  using (profile_id = (select id from public.profiles where user_id = auth.uid() limit 1))
  with check (profile_id = (select id from public.profiles where user_id = auth.uid() limit 1));

-- ------------------------------------------------------------
-- 5. volunteer_hours_log — annual recognition tracking
-- ------------------------------------------------------------

create table if not exists public.volunteer_hours_log (
  id          uuid        primary key default gen_random_uuid(),
  church_id   uuid        not null references public.churches (id) on delete cascade,
  profile_id  uuid        not null references public.profiles (id) on delete cascade,
  shift_id    uuid        references public.volunteer_shifts (id) on delete set null,
  service_date date       not null,
  hours       numeric(5,2) not null default 0,
  role_name   text,
  logged_by   uuid        references public.profiles (id) on delete set null,
  created_at  timestamptz not null default timezone('utc', now())
);

create index if not exists vhl_profile_id_idx on public.volunteer_hours_log (profile_id);
create index if not exists vhl_church_id_idx  on public.volunteer_hours_log (church_id);

alter table public.volunteer_hours_log enable row level security;

create policy "vhl_manage"
  on public.volunteer_hours_log for all
  to authenticated
  using (public.can_manage_church(church_id))
  with check (public.can_manage_church(church_id));

create policy "vhl_own_select"
  on public.volunteer_hours_log for select
  to authenticated
  using (profile_id = (select id from public.profiles where user_id = auth.uid() limit 1));

-- ------------------------------------------------------------
-- 6. service_plan_templates — reusable position blueprints
-- ------------------------------------------------------------

create table if not exists public.service_plan_templates (
  id          uuid        primary key default gen_random_uuid(),
  church_id   uuid        not null references public.churches (id) on delete cascade,
  name        text        not null,
  positions   jsonb       not null default '[]',
  is_active   boolean     not null default true,
  created_at  timestamptz not null default timezone('utc', now())
);

create index if not exists spt_church_id_idx on public.service_plan_templates (church_id);

alter table public.service_plan_templates enable row level security;

create policy "spt_manage"
  on public.service_plan_templates for all
  to authenticated
  using (public.can_manage_church(church_id))
  with check (public.can_manage_church(church_id));
