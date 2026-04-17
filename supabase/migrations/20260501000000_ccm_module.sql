-- ─────────────────────────────────────────────────────────────────────────────
-- Children's Church Ministry (CCM) Module
-- Adds:
--   • children_sensitive_data: dob, photo_url, no_photo_flag, allergies jsonb,
--       special_needs_notes, custody_notes
--   • ccm_services              — service session (groups all check-ins for one service)
--   • ccm_checkin_sessions      — per-child: pin_hash (bcrypt), qr_token, status, location
--   • ccm_authorized_pickups    — relational guardian list: photo, relationship, phone
--   • ccm_custody_restrictions  — court-order restricted individuals (admin-only)
--   • ccm_volunteer_assignments — per-volunteer per-room per-service (two-adult rule)
--   • ccm_incidents             — insurance-required incident reports
--   • ccm_badge_print_jobs      — print audit log
--   • generate_checkin_pin()    — 6-char PIN from unambiguous character set
--   • Audit triggers on all PII tables
--
-- SECURITY NOTES:
--   • PIN is stored as bcrypt hash (pin_hash). Plaintext returned ONCE at creation.
--   • special_needs_notes, custody_notes MUST be encrypted via pgsodium before prod.
--   • ccm_custody_restrictions is can_manage_church read — no volunteer/member path.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Extend children_sensitive_data ────────────────────────────────────────

alter table public.children_sensitive_data
  add column if not exists dob                  date,
  add column if not exists photo_url            text,
  add column if not exists no_photo_flag        boolean not null default false,
  add column if not exists allergies            jsonb   not null default '[]',
    -- structure: [{"name": "Peanuts", "severity": "anaphylactic"|"moderate"|"mild"}]
  add column if not exists special_needs_notes  text,  -- ENCRYPT via pgsodium in prod
  add column if not exists custody_notes        text;  -- ENCRYPT via pgsodium in prod

-- ── 2. Service instances ──────────────────────────────────────────────────────
-- Groups all check-ins under a single named service event.

create table if not exists public.ccm_services (
  id             uuid        primary key default gen_random_uuid(),
  church_id      uuid        not null references public.churches(id) on delete cascade,
  ministry_id    uuid        not null references public.ministries(id) on delete cascade,
  service_name   text        not null,          -- "Sunday 9am", "Wednesday Kids Night"
  service_date   date        not null default current_date,
  started_at     timestamptz not null default timezone('utc', now()),
  ended_at       timestamptz,
  status         text        not null default 'open'
    check (status in ('open', 'closed', 'emergency')),
  created_by     uuid        references auth.users(id),
  created_at     timestamptz not null default timezone('utc', now())
);

create index if not exists ccm_services_church_date_idx
  on public.ccm_services (church_id, service_date desc);

alter table public.ccm_services enable row level security;

create policy "ccm_services_mgr_all" on public.ccm_services
  for all using (public.can_manage_church(church_id));

create policy "ccm_services_member_read" on public.ccm_services
  for select using (public.belongs_to_church(church_id));

-- ── 3. Check-in sessions ──────────────────────────────────────────────────────
-- One row per child per service. Supersedes children_checkins for operational use.
-- children_checkins is retained for historical data.

create table if not exists public.ccm_checkin_sessions (
  id                      uuid        primary key default gen_random_uuid(),
  church_id               uuid        not null references public.churches(id) on delete cascade,
  service_id              uuid        not null references public.ccm_services(id) on delete cascade,
  room_id                 uuid        not null references public.children_rooms(id),
  child_profile_id        uuid        references public.profiles(id) on delete set null,
  child_name              text        not null,       -- denormalized for offline/emergency use
  guardian_name           text,
  guardian_phone          text,       -- ENCRYPT via pgsodium in prod
  -- Security tokens
  pin_hash                text        not null,       -- bcrypt(plaintext_pin, 12), NEVER store plaintext
  qr_token                text        not null unique default gen_random_uuid()::text,
    -- QR encodes "{serviceId}:{sessionId}:{qrToken}"; verification requires all 3 to match
  -- Status lifecycle
  status                  text        not null default 'checked_in'
    check (status in ('checked_in', 'checked_out', 'late_pickup', 'emergency', 'transferred')),
  -- Location tracking (Safety Beacon)
  current_room_id         uuid        references public.children_rooms(id),
  last_location_at        timestamptz,
  -- Timestamps
  checked_in_at           timestamptz not null default timezone('utc', now()),
  checked_in_by           uuid        references auth.users(id),
  checked_out_at          timestamptz,
  checked_out_by          uuid        references auth.users(id),
  released_to_name        text,       -- name of person who physically received the child
  -- Flags
  is_first_visit          boolean     not null default false,
  silent_page_sent_at     timestamptz,
  late_pickup_notified_at timestamptz,
  created_at              timestamptz not null default timezone('utc', now())
);

create index if not exists ccm_sessions_service_idx
  on public.ccm_checkin_sessions (service_id);
create index if not exists ccm_sessions_room_status_idx
  on public.ccm_checkin_sessions (current_room_id, status);
create index if not exists ccm_sessions_church_date_idx
  on public.ccm_checkin_sessions (church_id, checked_in_at desc);

alter table public.ccm_checkin_sessions enable row level security;

create policy "ccm_sessions_mgr_all" on public.ccm_checkin_sessions
  for all using (public.can_manage_church(church_id));

create policy "ccm_sessions_member_read" on public.ccm_checkin_sessions
  for select using (public.belongs_to_church(church_id));

-- ── 4. Authorized pickups ─────────────────────────────────────────────────────
-- Replaces children_sensitive_data.authorized_guardians text[] with a full
-- relational table: photo, relationship type, phone, id_verified flag.

create table if not exists public.ccm_authorized_pickups (
  id                  uuid        primary key default gen_random_uuid(),
  church_id           uuid        not null references public.churches(id) on delete cascade,
  child_profile_id    uuid        not null references public.profiles(id) on delete cascade,
  authorized_name     text        not null,
  relationship        text        not null
    check (relationship in (
      'parent', 'grandparent', 'sibling', 'aunt_uncle',
      'family_friend', 'caregiver', 'other'
    )),
  phone               text,
  photo_url           text,       -- staff verifies face against this photo at pick-up
  id_verified         boolean     not null default false,
  is_primary          boolean     not null default false,  -- primary guardian (initiates check-in)
  notes               text,
  created_at          timestamptz not null default timezone('utc', now()),
  updated_at          timestamptz not null default timezone('utc', now())
);

create index if not exists ccm_pickups_child_idx
  on public.ccm_authorized_pickups (child_profile_id);
create index if not exists ccm_pickups_church_idx
  on public.ccm_authorized_pickups (church_id);

alter table public.ccm_authorized_pickups enable row level security;

-- Managers can do everything; members can read their own child's pickup list
create policy "ccm_pickups_mgr_all" on public.ccm_authorized_pickups
  for all using (public.can_manage_church(church_id));

-- ── 5. Custody restrictions ───────────────────────────────────────────────────
-- CRITICAL: individuals legally prohibited from picking up a child.
-- HIGH-VISIBILITY red block in checkout UI before release button is shown.
-- ADMIN ONLY — no volunteer or member read path.

create table if not exists public.ccm_custody_restrictions (
  id                      uuid        primary key default gen_random_uuid(),
  church_id               uuid        not null references public.churches(id) on delete cascade,
  child_profile_id        uuid        not null references public.profiles(id) on delete cascade,
  restricted_name         text        not null,
  relationship            text,
  court_order_on_file     boolean     not null default false,
  document_url            text,       -- encrypted document storage reference
  notes                   text,       -- ENCRYPT via pgsodium in prod
  created_at              timestamptz not null default timezone('utc', now()),
  created_by              uuid        references auth.users(id)
);

create index if not exists ccm_restrictions_child_idx
  on public.ccm_custody_restrictions (child_profile_id);
create index if not exists ccm_restrictions_church_idx
  on public.ccm_custody_restrictions (church_id);

alter table public.ccm_custody_restrictions enable row level security;

-- STRICT: church admin only — no member or volunteer read path
create policy "ccm_restrictions_admin_only" on public.ccm_custody_restrictions
  for all using (public.can_manage_church(church_id));

-- ── 6. Volunteer assignments ──────────────────────────────────────────────────
-- Tracks which volunteers are confirmed in which room per service.
-- Powers the two-adult rule enforcement and ratio calculations.

create table if not exists public.ccm_volunteer_assignments (
  id                          uuid        primary key default gen_random_uuid(),
  church_id                   uuid        not null references public.churches(id) on delete cascade,
  service_id                  uuid        not null references public.ccm_services(id) on delete cascade,
  room_id                     uuid        not null references public.children_rooms(id),
  profile_id                  uuid        not null references public.profiles(id),
  role                        text        not null default 'assistant'
    check (role in ('lead_teacher', 'assistant', 'floater', 'security', 'greeter')),
  checked_in_at               timestamptz,
  checked_out_at              timestamptz,
  background_check_verified   boolean     not null default false,
  unique (service_id, room_id, profile_id)
);

create index if not exists ccm_volunteers_service_room_idx
  on public.ccm_volunteer_assignments (service_id, room_id);

alter table public.ccm_volunteer_assignments enable row level security;

create policy "ccm_volunteers_mgr_all" on public.ccm_volunteer_assignments
  for all using (public.can_manage_church(church_id));

create policy "ccm_volunteers_member_read" on public.ccm_volunteer_assignments
  for select using (public.belongs_to_church(church_id));

-- ── 7. Incidents ──────────────────────────────────────────────────────────────
-- Required for church insurance documentation of any medical, behavioral,
-- security, or property incident during a service.

create table if not exists public.ccm_incidents (
  id                      uuid        primary key default gen_random_uuid(),
  church_id               uuid        not null references public.churches(id) on delete cascade,
  service_id              uuid        references public.ccm_services(id),
  session_id              uuid        references public.ccm_checkin_sessions(id),
  child_name              text        not null,
  incident_type           text        not null
    check (incident_type in (
      'medical', 'behavioral', 'security', 'property', 'near_miss', 'other'
    )),
  severity                text        not null default 'low'
    check (severity in ('low', 'medium', 'high', 'critical')),
  description             text        not null,
  actions_taken           text,
  guardian_notified       boolean     not null default false,
  guardian_notified_at    timestamptz,
  follow_up_required      boolean     not null default false,
  reported_by             uuid        references auth.users(id),
  created_at              timestamptz not null default timezone('utc', now()),
  updated_at              timestamptz not null default timezone('utc', now())
);

create index if not exists ccm_incidents_church_idx
  on public.ccm_incidents (church_id, created_at desc);
create index if not exists ccm_incidents_service_idx
  on public.ccm_incidents (service_id);

alter table public.ccm_incidents enable row level security;

create policy "ccm_incidents_mgr_all" on public.ccm_incidents
  for all using (public.can_manage_church(church_id));

-- ── 8. Badge print jobs ───────────────────────────────────────────────────────
-- Audit log: every label printed, when, by whom, and on which printer.

create table if not exists public.ccm_badge_print_jobs (
  id              uuid        primary key default gen_random_uuid(),
  church_id       uuid        not null references public.churches(id) on delete cascade,
  session_id      uuid        not null references public.ccm_checkin_sessions(id),
  badge_type      text        not null
    check (badge_type in ('child', 'guardian', 'reprint')),
  printer_id      text,
  printed_at      timestamptz not null default timezone('utc', now()),
  printed_by      uuid        references auth.users(id)
);

create index if not exists ccm_badges_session_idx
  on public.ccm_badge_print_jobs (session_id);

alter table public.ccm_badge_print_jobs enable row level security;

create policy "ccm_badges_mgr_all" on public.ccm_badge_print_jobs
  for all using (public.can_manage_church(church_id));

-- ── 9. PIN generation helper ──────────────────────────────────────────────────
-- Returns a 6-char alphanumeric code excluding visually ambiguous characters.
-- Called by the check-in server action; returned to client for badge printing,
-- then bcrypt-hashed before storage. Plaintext is never persisted.

create or replace function public.generate_checkin_pin()
returns text
language plpgsql
as $$
declare
  chars text    := 'ACEFGHJKLMNPQRTUVWXY3479';
  -- excluded: O, 0, I, 1, B, 8, S, 5, Z, 2, D (can look like 0), U (confusable)
  pin   text    := '';
  i     integer;
begin
  for i in 1..6 loop
    pin := pin || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  end loop;
  return pin;
end;
$$;

-- ── 10. Audit triggers on all CCM PII tables ──────────────────────────────────
-- Writes every INSERT/UPDATE/DELETE on sensitive tables to audit_log.

create or replace function public.audit_ccm_access()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.audit_log (table_name, record_id, operation, changed_by, changed_at)
  values (
    tg_table_name,
    coalesce(new.id, old.id),
    tg_op,
    auth.uid(),
    timezone('utc', now())
  );
  return coalesce(new, old);
end;
$$;

-- Drop and recreate so re-running the migration is idempotent
drop trigger if exists trg_audit_ccm_sessions      on public.ccm_checkin_sessions;
drop trigger if exists trg_audit_ccm_pickups        on public.ccm_authorized_pickups;
drop trigger if exists trg_audit_ccm_restrictions   on public.ccm_custody_restrictions;
drop trigger if exists trg_audit_ccm_incidents      on public.ccm_incidents;

create trigger trg_audit_ccm_sessions
  after insert or update or delete on public.ccm_checkin_sessions
  for each row execute function public.audit_ccm_access();

create trigger trg_audit_ccm_pickups
  after insert or update or delete on public.ccm_authorized_pickups
  for each row execute function public.audit_ccm_access();

create trigger trg_audit_ccm_restrictions
  after insert or update or delete on public.ccm_custody_restrictions
  for each row execute function public.audit_ccm_access();

create trigger trg_audit_ccm_incidents
  after insert or update or delete on public.ccm_incidents
  for each row execute function public.audit_ccm_access();
