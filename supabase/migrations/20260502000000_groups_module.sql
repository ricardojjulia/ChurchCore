-- ============================================================
-- Small Groups Module
-- Phase 1 product roadmap: group directory, membership,
-- meetings, attendance, and resources.
-- ============================================================

-- ------------------------------------------------------------
-- 1. groups
-- ------------------------------------------------------------

create table if not exists public.groups (
  id               uuid        primary key default gen_random_uuid(),
  church_id        uuid        not null references public.churches (id) on delete cascade,
  name             text        not null,
  description      text,
  category         text        not null default 'general',
  leader_profile_id uuid       references public.profiles (id) on delete set null,
  meeting_day      text,
  meeting_time     text,
  meeting_location text,
  capacity         int,
  is_open          boolean     not null default true,
  is_active        boolean     not null default true,
  created_at       timestamptz not null default timezone('utc', now()),
  updated_at       timestamptz not null default timezone('utc', now())
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'groups_category_check'
  ) then
    alter table public.groups
      add constraint groups_category_check
      check (category in (
        'general', 'life_stage', 'geographic', 'interest',
        'discipleship', 'support', 'service', 'youth', 'seniors'
      ));
  end if;
end $$;

create index if not exists groups_church_id_idx       on public.groups (church_id);
create index if not exists groups_leader_id_idx       on public.groups (leader_profile_id);
create index if not exists groups_is_active_idx       on public.groups (church_id, is_active);

alter table public.groups enable row level security;

create policy "groups_select_open"
  on public.groups for select
  to authenticated
  using (
    public.belongs_to_church(church_id)
    and (is_open = true or public.can_manage_church(church_id))
  );

create policy "groups_manage_admin"
  on public.groups for all
  to authenticated
  using (public.can_manage_church(church_id))
  with check (public.can_manage_church(church_id));

-- ------------------------------------------------------------
-- 2. group_members
-- ------------------------------------------------------------

create table if not exists public.group_members (
  id         uuid        primary key default gen_random_uuid(),
  group_id   uuid        not null references public.groups (id) on delete cascade,
  church_id  uuid        not null references public.churches (id) on delete cascade,
  profile_id uuid        not null references public.profiles (id) on delete cascade,
  role       text        not null default 'member',
  status     text        not null default 'active',
  joined_at  timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  unique (group_id, profile_id)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'group_members_role_check'
  ) then
    alter table public.group_members
      add constraint group_members_role_check
      check (role in ('leader', 'co_leader', 'member'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'group_members_status_check'
  ) then
    alter table public.group_members
      add constraint group_members_status_check
      check (status in ('active', 'inactive', 'pending'));
  end if;
end $$;

create index if not exists group_members_group_id_idx   on public.group_members (group_id);
create index if not exists group_members_profile_id_idx on public.group_members (profile_id);
create index if not exists group_members_church_id_idx  on public.group_members (church_id);

alter table public.group_members enable row level security;

create policy "group_members_select"
  on public.group_members for select
  to authenticated
  using (
    -- own membership
    profile_id = (select id from public.profiles where user_id = auth.uid() limit 1)
    -- leaders see their group's members
    or group_id in (
      select gm2.group_id from public.group_members gm2
      where gm2.profile_id = (select id from public.profiles where user_id = auth.uid() limit 1)
        and gm2.role in ('leader', 'co_leader')
    )
    -- admins see all
    or public.can_manage_church(church_id)
  );

create policy "group_members_manage_admin"
  on public.group_members for all
  to authenticated
  using (public.can_manage_church(church_id))
  with check (public.can_manage_church(church_id));

-- Leaders can manage their own group's members
create policy "group_members_manage_leader"
  on public.group_members for insert
  to authenticated
  with check (
    group_id in (
      select gm2.group_id from public.group_members gm2
      where gm2.profile_id = (select id from public.profiles where user_id = auth.uid() limit 1)
        and gm2.role in ('leader', 'co_leader')
    )
  );

-- ------------------------------------------------------------
-- 3. group_meetings
-- ------------------------------------------------------------

create table if not exists public.group_meetings (
  id           uuid        primary key default gen_random_uuid(),
  group_id     uuid        not null references public.groups (id) on delete cascade,
  church_id    uuid        not null references public.churches (id) on delete cascade,
  scheduled_at timestamptz not null,
  location     text,
  notes        text,
  created_by   uuid        references public.profiles (id) on delete set null,
  created_at   timestamptz not null default timezone('utc', now())
);

create index if not exists group_meetings_group_id_idx    on public.group_meetings (group_id);
create index if not exists group_meetings_scheduled_at_idx on public.group_meetings (scheduled_at desc);

alter table public.group_meetings enable row level security;

create policy "group_meetings_select"
  on public.group_meetings for select
  to authenticated
  using (
    public.belongs_to_church(church_id)
    and (
      -- member of this group
      group_id in (
        select gm.group_id from public.group_members gm
        where gm.profile_id = (select id from public.profiles where user_id = auth.uid() limit 1)
          and gm.status = 'active'
      )
      or public.can_manage_church(church_id)
    )
  );

create policy "group_meetings_manage_admin"
  on public.group_meetings for all
  to authenticated
  using (public.can_manage_church(church_id))
  with check (public.can_manage_church(church_id));

-- ------------------------------------------------------------
-- 4. group_attendance
-- ------------------------------------------------------------

create table if not exists public.group_attendance (
  id         uuid        primary key default gen_random_uuid(),
  meeting_id uuid        not null references public.group_meetings (id) on delete cascade,
  group_id   uuid        not null references public.groups (id) on delete cascade,
  church_id  uuid        not null references public.churches (id) on delete cascade,
  profile_id uuid        not null references public.profiles (id) on delete cascade,
  status     text        not null default 'present',
  created_at timestamptz not null default timezone('utc', now()),
  unique (meeting_id, profile_id)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'group_attendance_status_check'
  ) then
    alter table public.group_attendance
      add constraint group_attendance_status_check
      check (status in ('present', 'absent', 'excused'));
  end if;
end $$;

create index if not exists group_attendance_meeting_id_idx  on public.group_attendance (meeting_id);
create index if not exists group_attendance_profile_id_idx  on public.group_attendance (profile_id);
create index if not exists group_attendance_church_id_idx   on public.group_attendance (church_id);

alter table public.group_attendance enable row level security;

create policy "group_attendance_select"
  on public.group_attendance for select
  to authenticated
  using (
    profile_id = (select id from public.profiles where user_id = auth.uid() limit 1)
    or public.can_manage_church(church_id)
    or group_id in (
      select gm.group_id from public.group_members gm
      where gm.profile_id = (select id from public.profiles where user_id = auth.uid() limit 1)
        and gm.role in ('leader', 'co_leader')
    )
  );

create policy "group_attendance_manage_admin"
  on public.group_attendance for all
  to authenticated
  using (public.can_manage_church(church_id))
  with check (public.can_manage_church(church_id));

-- ------------------------------------------------------------
-- 5. group_resources
-- ------------------------------------------------------------

create table if not exists public.group_resources (
  id            uuid        primary key default gen_random_uuid(),
  group_id      uuid        not null references public.groups (id) on delete cascade,
  church_id     uuid        not null references public.churches (id) on delete cascade,
  title         text        not null,
  url           text,
  resource_type text        not null default 'link',
  added_by      uuid        references public.profiles (id) on delete set null,
  created_at    timestamptz not null default timezone('utc', now())
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'group_resources_type_check'
  ) then
    alter table public.group_resources
      add constraint group_resources_type_check
      check (resource_type in ('link', 'file', 'note', 'video'));
  end if;
end $$;

create index if not exists group_resources_group_id_idx on public.group_resources (group_id);

alter table public.group_resources enable row level security;

create policy "group_resources_select"
  on public.group_resources for select
  to authenticated
  using (
    public.belongs_to_church(church_id)
    and group_id in (
      select gm.group_id from public.group_members gm
      where gm.profile_id = (select id from public.profiles where user_id = auth.uid() limit 1)
        and gm.status = 'active'
    )
    or public.can_manage_church(church_id)
  );

create policy "group_resources_manage_admin"
  on public.group_resources for all
  to authenticated
  using (public.can_manage_church(church_id))
  with check (public.can_manage_church(church_id));

-- ------------------------------------------------------------
-- 6. giving_fund_accounts — fund → GL account mapping
-- Used by the Giving GL auto-posting engine
-- ------------------------------------------------------------

create table if not exists public.giving_fund_accounts (
  id              uuid        primary key default gen_random_uuid(),
  church_id       uuid        not null references public.churches (id) on delete cascade,
  fund_designation text       not null,
  asset_account_id uuid       references public.finance_accounts (id) on delete set null,
  income_account_id uuid      references public.finance_accounts (id) on delete set null,
  is_active       boolean     not null default true,
  created_at      timestamptz not null default timezone('utc', now()),
  unique (church_id, fund_designation)
);

create index if not exists giving_fund_accounts_church_idx on public.giving_fund_accounts (church_id);

alter table public.giving_fund_accounts enable row level security;

create policy "giving_fund_accounts_manage"
  on public.giving_fund_accounts for all
  to authenticated
  using (public.can_manage_church(church_id))
  with check (public.can_manage_church(church_id));

-- ------------------------------------------------------------
-- 7. donation_gl_posts — audit log of GL postings from giving
-- ------------------------------------------------------------

create table if not exists public.donation_gl_posts (
  id            uuid        primary key default gen_random_uuid(),
  church_id     uuid        not null references public.churches (id) on delete cascade,
  donation_id   uuid        not null references public.donations (id) on delete cascade,
  journal_id    uuid        references public.finance_journals (id) on delete set null,
  posted_at     timestamptz not null default timezone('utc', now()),
  status        text        not null default 'posted',
  error_message text,
  unique (donation_id)
);

create index if not exists donation_gl_posts_church_idx    on public.donation_gl_posts (church_id);
create index if not exists donation_gl_posts_donation_idx  on public.donation_gl_posts (donation_id);

alter table public.donation_gl_posts enable row level security;

create policy "donation_gl_posts_manage"
  on public.donation_gl_posts for all
  to authenticated
  using (public.can_manage_church(church_id))
  with check (public.can_manage_church(church_id));

-- ------------------------------------------------------------
-- 8. public_giving_pages — per-church giving page config
-- ------------------------------------------------------------

create table if not exists public.public_giving_pages (
  id                   uuid    primary key default gen_random_uuid(),
  church_id            uuid    not null unique references public.churches (id) on delete cascade,
  slug                 text    not null unique,
  headline             text    not null default 'Give Online',
  description          text,
  funds                jsonb   not null default '["General Fund"]'::jsonb,
  stripe_account_id    text,
  is_live              boolean not null default false,
  allow_anonymous      boolean not null default true,
  created_at           timestamptz not null default timezone('utc', now()),
  updated_at           timestamptz not null default timezone('utc', now())
);

create index if not exists public_giving_pages_slug_idx on public.public_giving_pages (slug);

alter table public.public_giving_pages enable row level security;

create policy "public_giving_pages_select_live"
  on public.public_giving_pages for select
  using (is_live = true);

create policy "public_giving_pages_manage"
  on public.public_giving_pages for all
  to authenticated
  using (public.can_manage_church(church_id))
  with check (public.can_manage_church(church_id));

-- ------------------------------------------------------------
-- 9. service_attendance — track attendance at Sunday services
-- Separate from event-level attendance; aggregates to trend reports
-- ------------------------------------------------------------

create table if not exists public.service_attendance (
  id           uuid        primary key default gen_random_uuid(),
  church_id    uuid        not null references public.churches (id) on delete cascade,
  service_date date        not null,
  service_type text        not null default 'sunday_morning',
  headcount    int,
  created_by   uuid        references public.profiles (id) on delete set null,
  notes        text,
  created_at   timestamptz not null default timezone('utc', now()),
  unique (church_id, service_date, service_type)
);

create index if not exists service_attendance_church_date_idx
  on public.service_attendance (church_id, service_date desc);

alter table public.service_attendance enable row level security;

create policy "service_attendance_manage"
  on public.service_attendance for all
  to authenticated
  using (public.can_manage_church(church_id))
  with check (public.can_manage_church(church_id));

-- ------------------------------------------------------------
-- 10. first_time_visitors — guest capture + follow-up workflow
-- ------------------------------------------------------------

create table if not exists public.first_time_visitors (
  id             uuid        primary key default gen_random_uuid(),
  church_id      uuid        not null references public.churches (id) on delete cascade,
  profile_id     uuid        references public.profiles (id) on delete set null,
  full_name      text        not null,
  email          text,
  phone          text,
  visit_date     date        not null,
  referred_by    text,
  how_did_hear   text,
  workflow_stage text        not null default 'new',
  workflow_notes text,
  converted_at   timestamptz,
  created_at     timestamptz not null default timezone('utc', now())
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'first_time_visitors_stage_check'
  ) then
    alter table public.first_time_visitors
      add constraint first_time_visitors_stage_check
      check (workflow_stage in (
        'new', 'day1_sent', 'day7_sent', 'call_prompted', 'converted', 'inactive'
      ));
  end if;
end $$;

create index if not exists first_time_visitors_church_idx
  on public.first_time_visitors (church_id, visit_date desc);

alter table public.first_time_visitors enable row level security;

create policy "first_time_visitors_manage"
  on public.first_time_visitors for all
  to authenticated
  using (public.can_manage_church(church_id))
  with check (public.can_manage_church(church_id));
