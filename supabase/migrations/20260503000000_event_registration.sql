-- ============================================================
-- Event Registration Module
-- Adds self-service registration (free and paid) to events.
-- ============================================================

-- ------------------------------------------------------------
-- 1. event_registration_settings — per-event config
-- ------------------------------------------------------------

create table if not exists public.event_registration_settings (
  id                uuid        primary key default gen_random_uuid(),
  event_id          uuid        not null unique references public.events (id) on delete cascade,
  church_id         uuid        not null references public.churches (id) on delete cascade,
  registration_open boolean     not null default false,
  capacity          int,
  price_cents       int         not null default 0,
  currency          text        not null default 'usd',
  deadline          timestamptz,
  confirmation_message text,
  waitlist_enabled  boolean     not null default false,
  created_at        timestamptz not null default timezone('utc', now()),
  updated_at        timestamptz not null default timezone('utc', now())
);

create index if not exists event_reg_settings_event_id_idx  on public.event_registration_settings (event_id);
create index if not exists event_reg_settings_church_id_idx on public.event_registration_settings (church_id);

alter table public.event_registration_settings enable row level security;

create policy "event_reg_settings_manage"
  on public.event_registration_settings for all
  to authenticated
  using (public.can_manage_church(church_id))
  with check (public.can_manage_church(church_id));

-- ------------------------------------------------------------
-- 2. event_registrations — individual registrant records
-- ------------------------------------------------------------

create table if not exists public.event_registrations (
  id                   uuid        primary key default gen_random_uuid(),
  event_id             uuid        not null references public.events (id) on delete cascade,
  church_id            uuid        not null references public.churches (id) on delete cascade,
  profile_id           uuid        references public.profiles (id) on delete set null,
  registrant_name      text        not null,
  registrant_email     text,
  registrant_phone     text,
  status               text        not null default 'confirmed',
  is_waitlisted        boolean     not null default false,
  amount_paid_cents    int         not null default 0,
  stripe_payment_intent_id text,
  custom_fields        jsonb,
  notes                text,
  registered_at        timestamptz not null default timezone('utc', now()),
  checked_in_at        timestamptz,
  created_at           timestamptz not null default timezone('utc', now())
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'event_registrations_status_check'
  ) then
    alter table public.event_registrations
      add constraint event_registrations_status_check
      check (status in ('confirmed', 'cancelled', 'waitlisted', 'attended'));
  end if;
end $$;

create index if not exists event_registrations_event_id_idx   on public.event_registrations (event_id);
create index if not exists event_registrations_church_id_idx  on public.event_registrations (church_id);
create index if not exists event_registrations_profile_id_idx on public.event_registrations (profile_id);

alter table public.event_registrations enable row level security;

-- Admins see all registrations for their church
create policy "event_registrations_manage"
  on public.event_registrations for all
  to authenticated
  using (public.can_manage_church(church_id))
  with check (public.can_manage_church(church_id));

-- Members can see and manage their own registrations
create policy "event_registrations_select_own"
  on public.event_registrations for select
  to authenticated
  using (
    profile_id = (select id from public.profiles where user_id = auth.uid() limit 1)
  );

-- Unauthenticated inserts allowed so public forms work without login
-- (church_id must be passed and verified by the action)
create policy "event_registrations_public_insert"
  on public.event_registrations for insert
  with check (true);
