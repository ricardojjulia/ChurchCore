-- G2.2: kiosk self check-in (children's ministry).
--
-- A church admin signs in on a tablet and starts kiosk mode; families look
-- themselves up by phone number or a family check-in code (typed or scanned
-- from a QR) and check their children in. The kiosk can only look up and
-- check in; everything is enforced in server code (lib/ccm-kiosk-core.ts), this
-- migration supplies the data it needs.
--
--   1. profiles.phone_digits     generated digits-only copy of phone, so the
--                                kiosk can do an exact, indexed phone match
--                                (profiles.phone is free text).
--   2. families.checkin_code     8-character family code (Crockford base32, no
--      + checkin_code_rotated_at I/L/O/U), unique per church. Plain storage:
--                                it is matched by equality and shown to the
--                                family. Column-level SELECT is revoked from
--                                anon/authenticated (families_select_member_scope
--                                lets any church member read every family row);
--                                only the service role (server code) reads it.
--   3. ccm_kiosk_sessions        one row per started kiosk; the cc_kiosk cookie
--                                holds only the row id. Also holds the single
--                                short-lived "household token" (hash) that
--                                binds a lookup result to this kiosk.
--   4. ccm_kiosk_lookup_attempts failed/successful lookup and exit attempts,
--                                for the per-device and church-wide rate limit
--                                (lib/rate-limit.ts is in-memory and not used).
--   5. ccm_checkin_sessions      partial unique index: a child can be actively
--                                checked in once per service (closes the
--                                double-tap / two-device duplicate), plus
--                                checkin_source ('staff' | 'kiosk').
--
-- No SECURITY DEFINER functions. Writes to the new tables go through the
-- church-scoped service-role client; authenticated church admins can only read.
--
-- Maintenance note: families now has column-level SELECT grants. A column added
-- to families later must be granted to authenticated explicitly, or reads of it
-- through the user-scoped client fail with "permission denied".
--
-- Rollback:
--   drop index if exists public.ccm_sessions_one_active_per_child;
--   alter table public.ccm_checkin_sessions drop column checkin_source;
--   drop table if exists public.ccm_kiosk_lookup_attempts;
--   drop table if exists public.ccm_kiosk_sessions;
--   grant select on public.families to anon, authenticated;
--   drop index if exists public.families_church_checkin_code_idx;
--   alter table public.families drop column checkin_code,
--     drop column checkin_code_rotated_at;
--   drop index if exists public.profiles_church_phone_digits_idx;
--   alter table public.profiles drop column phone_digits;

-- 1. Digits-only phone, for exact matching ------------------------------------

alter table public.profiles
  add column phone_digits text
    generated always as (nullif(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), '')) stored;

create index profiles_church_phone_digits_idx
  on public.profiles (church_id, phone_digits)
  where phone_digits is not null;

-- 2. Family check-in code -----------------------------------------------------

alter table public.families
  add column checkin_code text
    check (checkin_code is null or checkin_code ~ '^[0-9A-HJKMNP-TV-Z]{8}$'),
  add column checkin_code_rotated_at timestamptz;

create unique index families_church_checkin_code_idx
  on public.families (church_id, checkin_code)
  where checkin_code is not null;

-- Everything except checkin_code stays readable exactly as before.
revoke select on public.families from anon, authenticated;
grant select (id, church_id, family_name, address, home_phone, created_at, updated_at)
  on public.families to anon, authenticated;

-- 3. Kiosk sessions -----------------------------------------------------------

create table public.ccm_kiosk_sessions (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  admin_login_id uuid not null,
  device_id uuid not null default gen_random_uuid(),
  device_note text,
  started_at timestamptz not null default timezone('utc', now()),
  ended_at timestamptz,
  -- The one outstanding lookup result: sha256 of a random token, the family it
  -- resolved to, and when it stops being valid (3 minutes). Overwritten by the
  -- next lookup. The token itself is never stored.
  household_token_hash text,
  household_family_id uuid references public.families(id) on delete set null,
  household_token_expires_at timestamptz
);

create index ccm_kiosk_sessions_church_idx
  on public.ccm_kiosk_sessions (church_id, started_at desc);

alter table public.ccm_kiosk_sessions enable row level security;

create policy "ccm_kiosk_sessions_select_church_admin" on public.ccm_kiosk_sessions
  for select to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1 from public.church_memberships membership
      where membership.church_id = ccm_kiosk_sessions.church_id
        and membership.user_id = auth.uid()
        and membership.role = 'church_admin'
        and membership.is_active
    )
  );

revoke all on public.ccm_kiosk_sessions from anon;

-- 4. Lookup / exit attempts (rate limiting) ------------------------------------

create table public.ccm_kiosk_lookup_attempts (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  device_id_hash text not null,
  kind text not null check (kind in ('phone', 'code', 'exit')),
  success boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

create index ccm_kiosk_lookup_attempts_rate_idx
  on public.ccm_kiosk_lookup_attempts (church_id, device_id_hash, created_at desc);

alter table public.ccm_kiosk_lookup_attempts enable row level security;

create policy "ccm_kiosk_lookup_attempts_select_manage" on public.ccm_kiosk_lookup_attempts
  for select to authenticated
  using (public.can_manage_church(church_id));

revoke all on public.ccm_kiosk_lookup_attempts from anon;

-- 5. One active check-in per child per service ---------------------------------

alter table public.ccm_checkin_sessions
  add column checkin_source text not null default 'staff'
    check (checkin_source in ('staff', 'kiosk'));

create unique index ccm_sessions_one_active_per_child
  on public.ccm_checkin_sessions (service_id, child_profile_id)
  where child_profile_id is not null
    and status in ('checked_in', 'late_pickup', 'emergency', 'transferred');
