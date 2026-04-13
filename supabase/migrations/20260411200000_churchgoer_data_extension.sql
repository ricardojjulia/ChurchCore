-- ============================================================
-- Churchgoer Data Extension
-- Ref: churchgoer_data.md
-- Adds: families table, attendance table, extended profile fields
-- Sprint 1 extension / Sprint 2 prep
-- ============================================================

-- ------------------------------------------------------------
-- 1. families table (must exist before profiles.family_id FK)
-- ------------------------------------------------------------

create table if not exists public.families (
  id          uuid        primary key default gen_random_uuid(),
  church_id   uuid        not null references public.churches (id) on delete cascade,
  family_name text        not null,
  address     text,
  home_phone  text,
  created_at  timestamptz not null default timezone('utc', now()),
  updated_at  timestamptz not null default timezone('utc', now())
);

create index if not exists families_church_id_idx
  on public.families (church_id);

create trigger set_families_updated_at
  before update on public.families
  for each row execute function public.set_updated_at();

alter table public.families enable row level security;

create policy "families_select_member_scope"
  on public.families for select
  to authenticated
  using (public.belongs_to_church(church_id));

create policy "families_manage_management_scope"
  on public.families for all
  to authenticated
  using (public.can_manage_church(church_id))
  with check (public.can_manage_church(church_id));

-- ------------------------------------------------------------
-- 2. Extended profile columns
-- ------------------------------------------------------------

alter table public.profiles
  add column if not exists date_of_birth          date,
  add column if not exists family_id              uuid        references public.families (id) on delete set null,
  add column if not exists preferred_contact_method text,
  add column if not exists emergency_contact_name  text,
  add column if not exists emergency_contact_phone text,
  add column if not exists notes                   text,
  add column if not exists last_attendance         timestamptz,
  add column if not exists membership_status       text        not null default 'active',
  add column if not exists joined_date             date        not null default current_date,
  add column if not exists directory_visible       boolean     not null default true,
  add column if not exists contact_allowed         boolean     not null default true;

-- Add constraints only if they don't already exist

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_preferred_contact_method_check'
  ) then
    alter table public.profiles
      add constraint profiles_preferred_contact_method_check
      check (preferred_contact_method is null or preferred_contact_method in ('email', 'sms', 'app', 'none'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_membership_status_check'
  ) then
    alter table public.profiles
      add constraint profiles_membership_status_check
      check (membership_status in ('active', 'inactive', 'visitor', 'baptized', 'transferred'));
  end if;
end $$;

create index if not exists profiles_family_id_idx
  on public.profiles (family_id);

create index if not exists profiles_membership_status_idx
  on public.profiles (church_id, membership_status);

-- ------------------------------------------------------------
-- 3. attendance table
-- ------------------------------------------------------------

create table if not exists public.attendance (
  id            uuid        primary key default gen_random_uuid(),
  profile_id    uuid        not null references public.profiles (id) on delete cascade,
  event_id      uuid        references public.events (id) on delete set null,
  checked_in_at timestamptz not null default timezone('utc', now()),
  status        text        not null default 'present',
  created_at    timestamptz not null default timezone('utc', now())
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'attendance_status_check'
  ) then
    alter table public.attendance
      add constraint attendance_status_check
      check (status in ('present', 'absent', 'excused'));
  end if;
end $$;

create index if not exists attendance_profile_id_idx
  on public.attendance (profile_id);

create index if not exists attendance_event_id_idx
  on public.attendance (event_id);

create index if not exists attendance_checked_in_at_idx
  on public.attendance (checked_in_at desc);

alter table public.attendance enable row level security;

-- Members can see their own attendance; admins/pastors see all within their church
create policy "attendance_select_own_scope"
  on public.attendance for select
  to authenticated
  using (
    profile_id = (
      select id from public.profiles
      where user_id = auth.uid()
      limit 1
    )
    or exists (
      select 1 from public.profiles p
      where p.id = attendance.profile_id
        and public.can_manage_church(p.church_id)
    )
  );

create policy "attendance_manage_management_scope"
  on public.attendance for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = attendance.profile_id
        and public.can_manage_church(p.church_id)
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = attendance.profile_id
        and public.can_manage_church(p.church_id)
    )
  );

-- ------------------------------------------------------------
-- 4. Auto-update profiles.last_attendance on attendance insert
-- ------------------------------------------------------------

create or replace function public.sync_last_attendance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set last_attendance = new.checked_in_at
  where id = new.profile_id
    and (last_attendance is null or new.checked_in_at > last_attendance);
  return new;
end;
$$;

drop trigger if exists sync_last_attendance_after_insert on public.attendance;

create trigger sync_last_attendance_after_insert
  after insert on public.attendance
  for each row
  execute function public.sync_last_attendance();
