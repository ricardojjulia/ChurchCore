-- ============================================================
-- Finding 4 vertical slice: service planning + registration workflow
-- Adds run-of-service rows, service metadata, registration form fields,
-- and approval/household registration settings.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Extend service_plans with worship/service metadata
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'service_plans' and column_name = 'service_type'
  ) then
    alter table public.service_plans
      add column service_type text not null default 'worship';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'service_plans' and column_name = 'scripture_reference'
  ) then
    alter table public.service_plans
      add column scripture_reference text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'service_plans' and column_name = 'sermon_title'
  ) then
    alter table public.service_plans
      add column sermon_title text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'service_plans' and column_name = 'sermon_speaker'
  ) then
    alter table public.service_plans
      add column sermon_speaker text;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'service_plans_service_type_check'
  ) then
    alter table public.service_plans
      add constraint service_plans_service_type_check
      check (service_type in ('worship', 'prayer', 'youth', 'special_event', 'class', 'other'));
  end if;
end $$;

-- ------------------------------------------------------------
-- 2) Run-of-service schedule blocks
-- ------------------------------------------------------------

create table if not exists public.service_plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.service_plans (id) on delete cascade,
  church_id uuid not null references public.churches (id) on delete cascade,
  starts_at timestamptz,
  ends_at timestamptz,
  title text not null,
  item_type text not null default 'segment',
  leader_name text,
  notes text,
  attachment_url text,
  sort_order int not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists spi_plan_id_idx on public.service_plan_items (plan_id);
create index if not exists spi_church_id_idx on public.service_plan_items (church_id);

alter table public.service_plan_items enable row level security;

create policy "spi_manage"
  on public.service_plan_items for all
  to authenticated
  using (public.can_manage_church(church_id))
  with check (public.can_manage_church(church_id));

create policy "spi_select_member"
  on public.service_plan_items for select
  to authenticated
  using (public.belongs_to_church(church_id));

-- ------------------------------------------------------------
-- 3) Registration settings: approval + household mode
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'event_registration_settings' and column_name = 'approval_required'
  ) then
    alter table public.event_registration_settings
      add column approval_required boolean not null default false;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'event_registration_settings' and column_name = 'household_registration_enabled'
  ) then
    alter table public.event_registration_settings
      add column household_registration_enabled boolean not null default false;
  end if;
end $$;

-- ------------------------------------------------------------
-- 4) Registration form field definitions per event
-- ------------------------------------------------------------

create table if not exists public.event_registration_form_fields (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  church_id uuid not null references public.churches (id) on delete cascade,
  label text not null,
  field_key text not null,
  field_type text not null default 'text',
  is_required boolean not null default false,
  options jsonb,
  sort_order int not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  unique (event_id, field_key)
);

create index if not exists erff_event_id_idx on public.event_registration_form_fields (event_id);
create index if not exists erff_church_id_idx on public.event_registration_form_fields (church_id);

alter table public.event_registration_form_fields enable row level security;

create policy "erff_manage"
  on public.event_registration_form_fields for all
  to authenticated
  using (public.can_manage_church(church_id))
  with check (public.can_manage_church(church_id));

create policy "erff_read_member"
  on public.event_registration_form_fields for select
  to authenticated
  using (public.belongs_to_church(church_id));

-- ------------------------------------------------------------
-- 5) Registration status adds pending-approval state
-- ------------------------------------------------------------

do $$
begin
  alter table public.event_registrations
    drop constraint if exists event_registrations_status_check;

  alter table public.event_registrations
    add constraint event_registrations_status_check
    check (status in ('pending_approval', 'confirmed', 'cancelled', 'waitlisted', 'attended'));
end $$;
