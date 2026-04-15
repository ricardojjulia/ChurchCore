-- ============================================================
-- Sprint 2: Attendance, Rosters, and Member Identity Flow
-- Ref: DEVELOPMENT_PLAN.md
-- Ref: docs/adr/0002-control-plane-and-tenant-separation.md
--
-- Notes:
--   - Reuses the existing public.attendance table instead of creating a
--     parallel attendance_records table so the tenant schema stays aligned.
--   - Enables offline member profiles by decoupling profiles.id from auth.users.
--   - Adds public portal request RPCs with SECURITY DEFINER so the public
--     registration form can work without exposing tenant profile tables.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Profiles: support offline records + member identity fields
-- ------------------------------------------------------------

-- The original schema coupled profiles.id directly to auth.users(id),
-- which prevents visitor records and account-request staging profiles.
-- Sprint 2 requires offline profiles, so we move auth linkage to user_id.
alter table public.profiles
  alter column id set default gen_random_uuid();

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'profiles_id_fkey'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      drop constraint profiles_id_fkey;
  end if;
end $$;

alter table public.profiles
  alter column user_id drop not null;

drop index if exists public.profiles_user_id_uidx;

create unique index if not exists profiles_user_id_uidx
  on public.profiles (user_id)
  where user_id is not null;

alter table public.profiles
  add column if not exists member_number text,
  add column if not exists account_status text not null default 'pending',
  add column if not exists is_roster_eligible boolean not null default true;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_account_status_check'
  ) then
    alter table public.profiles
      add constraint profiles_account_status_check
      check (account_status in ('pending', 'active', 'disabled'));
  end if;
end $$;

create unique index if not exists profiles_member_number_uidx
  on public.profiles (member_number)
  where member_number is not null;

update public.profiles
set account_status = 'active'
where user_id is not null
  and account_status = 'pending';

drop policy if exists "profiles_select_self" on public.profiles;

create policy "profiles_select_self"
on public.profiles
for select
to authenticated
using (user_id = auth.uid());

-- Align new auth users to an existing offline profile when email matches.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_profile_id uuid;
begin
  select profile.id
  into existing_profile_id
  from public.profiles profile
  where profile.user_id = new.id
     or (
       profile.user_id is null
       and profile.email is not null
       and new.email is not null
       and lower(profile.email) = lower(new.email)
     )
  order by
    case when profile.user_id = new.id then 0 else 1 end,
    profile.created_at asc
  limit 1;

  if existing_profile_id is null then
    insert into public.profiles (id, user_id, email, full_name, avatar_url, account_status)
    values (
      gen_random_uuid(),
      new.id,
      new.email,
      coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
      new.raw_user_meta_data ->> 'avatar_url',
      'active'
    );
  else
    update public.profiles
    set
      user_id = new.id,
      email = coalesce(new.email, public.profiles.email),
      full_name = coalesce(
        new.raw_user_meta_data ->> 'full_name',
        new.raw_user_meta_data ->> 'name',
        public.profiles.full_name
      ),
      avatar_url = coalesce(new.raw_user_meta_data ->> 'avatar_url', public.profiles.avatar_url),
      account_status = case
        when public.profiles.account_status = 'disabled' then 'disabled'
        else 'active'
      end,
      updated_at = timezone('utc', now())
    where id = existing_profile_id;
  end if;

  return new;
end;
$$;

-- ------------------------------------------------------------
-- 2. Shared helper functions
-- ------------------------------------------------------------

create or replace function public.can_manage_member_records(target_church uuid)
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
        and membership.role in ('church_admin', 'pastor')
    );
$$;

create or replace function public.generate_member_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate text;
begin
  loop
    candidate :=
      'CF-' ||
      to_char(timezone('utc', now()), 'MMDD') ||
      '-' ||
      upper(substring(encode(gen_random_bytes(4), 'hex') from 1 for 6));

    exit when not exists (
      select 1
      from public.profiles
      where member_number = candidate
    );
  end loop;

  return candidate;
end;
$$;

create or replace function public.list_portal_churches()
returns table (
  id uuid,
  name text,
  slug text,
  timezone text
)
language sql
security definer
set search_path = public
stable
as $$
  select church.id, church.name, church.slug::text, church.timezone
  from public.churches church
  order by church.name;
$$;

grant execute on function public.generate_member_number() to authenticated;
grant execute on function public.list_portal_churches() to anon, authenticated;

-- ------------------------------------------------------------
-- 3. Attendance extensions (existing public.attendance)
-- ------------------------------------------------------------

alter table public.attendance
  add column if not exists church_id uuid references public.churches(id) on delete cascade,
  add column if not exists check_in_method text not null default 'manual_admin';

update public.attendance attendance
set church_id = profile.church_id
from public.profiles profile
where profile.id = attendance.profile_id
  and attendance.church_id is null;

alter table public.attendance
  alter column church_id set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'attendance_check_in_method_check'
  ) then
    alter table public.attendance
      add constraint attendance_check_in_method_check
      check (check_in_method in ('manual_admin', 'self_checkin', 'nfc_qr'));
  end if;
end $$;

create index if not exists attendance_church_id_idx
  on public.attendance (church_id, checked_in_at desc);

create unique index if not exists attendance_event_profile_present_uidx
  on public.attendance (event_id, profile_id)
  where event_id is not null
    and status = 'present';

drop policy if exists "attendance_select_own_scope" on public.attendance;
drop policy if exists "attendance_manage_management_scope" on public.attendance;

create policy "attendance_select_own_scope"
  on public.attendance for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles profile
      where profile.id = attendance.profile_id
        and profile.user_id = auth.uid()
    )
    or public.can_manage_member_records(church_id)
  );

create policy "attendance_manage_management_scope"
  on public.attendance for all
  to authenticated
  using (public.can_manage_member_records(church_id))
  with check (public.can_manage_member_records(church_id));

-- ------------------------------------------------------------
-- 4. Event rosters
-- ------------------------------------------------------------

create table if not exists public.event_rosters (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role_title text not null,
  is_confirmed boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists event_rosters_event_profile_role_uidx
  on public.event_rosters (event_id, profile_id, role_title);

create index if not exists event_rosters_church_event_idx
  on public.event_rosters (church_id, event_id, created_at desc);

create index if not exists event_rosters_profile_idx
  on public.event_rosters (profile_id, created_at desc);

alter table public.event_rosters enable row level security;

drop policy if exists "event_rosters_select_scope" on public.event_rosters;
drop policy if exists "event_rosters_manage_scope" on public.event_rosters;

create policy "event_rosters_select_scope"
  on public.event_rosters for select
  to authenticated
  using (
    public.can_manage_member_records(church_id)
    or exists (
      select 1
      from public.profiles profile
      where profile.id = event_rosters.profile_id
        and profile.user_id = auth.uid()
    )
  );

create policy "event_rosters_manage_scope"
  on public.event_rosters for all
  to authenticated
  using (public.can_manage_member_records(church_id))
  with check (
    public.can_manage_member_records(church_id)
    and exists (
      select 1
      from public.events event
      join public.profiles profile
        on profile.id = event_rosters.profile_id
      where event.id = event_rosters.event_id
        and event.church_id = event_rosters.church_id
        and profile.church_id = event_rosters.church_id
        and profile.is_roster_eligible = true
    )
  );

-- ------------------------------------------------------------
-- 5. Account requests
-- ------------------------------------------------------------

create table if not exists public.account_requests (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  email text not null,
  phone text,
  first_name text not null,
  last_name text not null,
  is_existing_member boolean not null default false,
  status text not null default 'pending',
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'account_requests_status_check'
  ) then
    alter table public.account_requests
      add constraint account_requests_status_check
      check (status in ('pending', 'approved', 'rejected'));
  end if;
end $$;

create unique index if not exists account_requests_pending_email_uidx
  on public.account_requests (church_id, email)
  where status = 'pending';

create index if not exists account_requests_church_status_idx
  on public.account_requests (church_id, status, created_at desc);

alter table public.account_requests enable row level security;

drop policy if exists "account_requests_insert_public" on public.account_requests;
drop policy if exists "account_requests_select_management_scope" on public.account_requests;
drop policy if exists "account_requests_manage_management_scope" on public.account_requests;

create policy "account_requests_insert_public"
  on public.account_requests for insert
  to anon, authenticated
  with check (status = 'pending');

create policy "account_requests_select_management_scope"
  on public.account_requests for select
  to authenticated
  using (public.can_manage_member_records(church_id));

create policy "account_requests_manage_management_scope"
  on public.account_requests for all
  to authenticated
  using (public.can_manage_member_records(church_id))
  with check (public.can_manage_member_records(church_id));

create or replace function public.submit_account_request(
  target_church_id uuid,
  request_email text,
  request_first_name text,
  request_last_name text,
  request_phone text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_profile record;
  request_id uuid;
  normalized_email text;
begin
  normalized_email := lower(trim(coalesce(request_email, '')));

  if target_church_id is null then
    raise exception 'A church is required.';
  end if;

  if normalized_email = '' then
    raise exception 'An email address is required.';
  end if;

  if trim(coalesce(request_first_name, '')) = '' or trim(coalesce(request_last_name, '')) = '' then
    raise exception 'First and last name are required.';
  end if;

  if not exists (
    select 1
    from public.churches church
    where church.id = target_church_id
  ) then
    raise exception 'The selected church was not found.';
  end if;

  select
    profile.id,
    profile.user_id,
    profile.account_status
  into existing_profile
  from public.profiles profile
  where profile.church_id = target_church_id
    and profile.email is not null
    and lower(profile.email) = normalized_email
    and profile.merged_at is null
  order by profile.created_at asc
  limit 1;

  if existing_profile.user_id is not null and existing_profile.account_status = 'active' then
    raise exception 'An active portal account already exists for this email.';
  end if;

  insert into public.account_requests (
    church_id,
    profile_id,
    email,
    phone,
    first_name,
    last_name,
    is_existing_member,
    status
  )
  values (
    target_church_id,
    existing_profile.id,
    normalized_email,
    nullif(trim(coalesce(request_phone, '')), ''),
    trim(request_first_name),
    trim(request_last_name),
    existing_profile.id is not null,
    'pending'
  )
  on conflict (church_id, email)
  where status = 'pending'
  do update set
    profile_id = excluded.profile_id,
    phone = excluded.phone,
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    is_existing_member = excluded.is_existing_member
  returning id into request_id;

  return request_id;
end;
$$;

grant execute on function public.submit_account_request(uuid, text, text, text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- 6. Audit triggers for new/write-heavy tables
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'audit_attendance_changes'
      and tgrelid = 'public.attendance'::regclass
  ) then
    create trigger audit_attendance_changes
    after insert or update or delete on public.attendance
    for each row execute function public.audit_log_changes();
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'audit_event_rosters_changes'
      and tgrelid = 'public.event_rosters'::regclass
  ) then
    create trigger audit_event_rosters_changes
    after insert or update or delete on public.event_rosters
    for each row execute function public.audit_log_changes();
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'audit_account_requests_changes'
      and tgrelid = 'public.account_requests'::regclass
  ) then
    create trigger audit_account_requests_changes
    after insert or update or delete on public.account_requests
    for each row execute function public.audit_log_changes();
  end if;
end $$;
