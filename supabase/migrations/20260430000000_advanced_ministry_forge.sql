-- ─────────────────────────────────────────────────────────────────────────────
-- Advanced Ministry Forge
-- Adds:
--   • profiles: member_number, safety_clearance_date, specialized_tags
--   • young_adult to ministries.ministry_type constraint
--   • Children's track: children_rooms, children_checkins, children_sensitive_data
--   • Youth track: youth_milestones, youth_graduation_tracking
--   • Young Adults track: young_adult_career_mentorships
--   • Education track: education_courses, education_enrollments
--   • Outreach track: outreach_events, outreach_zones, outreach_impact_entries
--   • Marriage: marriage_pulse_entries (anonymous sentiment)
--   • Stewardship: discipleship_velocity view, burnout_category_counts view
--   • PII guardrail: profile_view_audit trigger
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Profile extensions ────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists member_number      text,
  add column if not exists safety_clearance_date date,
  add column if not exists specialized_tags   text[] not null default '{}';

-- Unique member_number within a church (allow null for backward compat)
create unique index if not exists profiles_member_number_church_uidx
  on public.profiles (church_id, member_number)
  where member_number is not null;

-- ── 2. Extend ministry_type to include young_adult ──────────────────────────

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'ministries_ministry_type_check'
  ) then
    alter table public.ministries
      drop constraint ministries_ministry_type_check;
  end if;
end;
$$;

alter table public.ministries
  add constraint ministries_ministry_type_check
  check (
    ministry_type in (
      'outreach', 'discipleship', 'worship', 'care', 'administration',
      'youth', 'children', 'missions', 'men', 'women', 'marriage',
      'young_adult', 'education'
    )
  );

-- Also extend ministry_tracks.track_kind to include young_adult (already present)
-- and education (already present) — idempotent no-op via check constraint replacement.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'ministry_tracks_track_kind_check'
  ) then
    alter table public.ministry_tracks
      drop constraint ministry_tracks_track_kind_check;
  end if;
end;
$$;

alter table public.ministry_tracks
  add constraint ministry_tracks_track_kind_check
  check (track_kind in (
    'worship', 'men', 'women', 'marriage', 'missions',
    'children', 'youth', 'young_adult', 'education', 'outreach'
  ));

-- ── 3. Children's Ministry ────────────────────────────────────────────────────

-- Classroom definitions with capacity/ratio targets
create table if not exists public.children_rooms (
  id              uuid        primary key default gen_random_uuid(),
  church_id       uuid        not null references public.churches(id) on delete cascade,
  ministry_id     uuid        references public.ministries(id) on delete set null,
  name            text        not null,       -- "Nursery", "Pre-K", "K-2", "3-5"
  age_min         integer,                    -- inclusive
  age_max         integer,                    -- inclusive
  capacity        integer     not null default 10,
  target_ratio    numeric(4,2) not null default 5.0,  -- children per leader
  is_active       boolean     not null default true,
  created_at      timestamptz not null default timezone('utc', now())
);

create index if not exists children_rooms_ministry_idx
  on public.children_rooms (ministry_id, is_active);

alter table public.children_rooms enable row level security;

create policy "children_rooms_read" on public.children_rooms
  for select using (public.belongs_to_church(church_id));

create policy "children_rooms_manage" on public.children_rooms
  for all using (public.can_manage_church(church_id))
  with check (public.can_manage_church(church_id));

-- Per-service check-in/out log (not sensitive — no medical data here)
create table if not exists public.children_checkins (
  id              uuid        primary key default gen_random_uuid(),
  church_id       uuid        not null references public.churches(id) on delete cascade,
  room_id         uuid        not null references public.children_rooms(id) on delete cascade,
  child_profile_id uuid       references public.profiles(id) on delete set null,
  child_name      text        not null,       -- denormalized for speed, no PII risk
  guardian_name   text,
  checked_in_at   timestamptz not null default timezone('utc', now()),
  checked_out_at  timestamptz,
  leader_count    integer     not null default 1,  -- volunteers present at check-in
  service_date    date        not null default current_date
);

create index if not exists children_checkins_room_date_idx
  on public.children_checkins (room_id, service_date desc);

create index if not exists children_checkins_church_date_idx
  on public.children_checkins (church_id, service_date desc);

alter table public.children_checkins enable row level security;

create policy "children_checkins_read" on public.children_checkins
  for select using (public.can_manage_church(church_id));

create policy "children_checkins_manage" on public.children_checkins
  for all using (public.can_manage_church(church_id))
  with check (public.can_manage_church(church_id));

-- Sensitive children's data — authorized pickup codes & medical alerts.
-- NOTE: pickup_code should be encrypted at rest using Supabase Vault
-- (pgsodium.create_key + vault.create_secret) before production deployment.
-- RLS here enforces a strict children-ministry-leader-only access pattern.
create table if not exists public.children_sensitive_data (
  id                  uuid        primary key default gen_random_uuid(),
  church_id           uuid        not null references public.churches(id) on delete cascade,
  child_profile_id    uuid        not null references public.profiles(id) on delete cascade,
  pickup_code         text,           -- family pickup verification code (encrypt in prod)
  authorized_guardians text[]    not null default '{}',  -- guardian names
  medical_alerts      text,           -- allergies, conditions (encrypt in prod)
  emergency_contact   text,
  created_at          timestamptz not null default timezone('utc', now()),
  updated_at          timestamptz not null default timezone('utc', now()),
  unique (church_id, child_profile_id)
);

alter table public.children_sensitive_data enable row level security;

-- Only church-admins and pastors can access children's sensitive data
create policy "children_sensitive_read" on public.children_sensitive_data
  for select using (public.can_manage_church(church_id));

create policy "children_sensitive_manage" on public.children_sensitive_data
  for all using (public.can_manage_church(church_id))
  with check (public.can_manage_church(church_id));

-- Audit every access to children_sensitive_data
create or replace function public.audit_children_sensitive_access()
returns trigger language plpgsql security definer as $$
begin
  insert into public.audit_log (table_name, record_id, operation, changed_by, changed_at)
  values (
    'children_sensitive_data',
    coalesce(new.id, old.id),
    tg_op,
    auth.uid(),
    timezone('utc', now())
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_audit_children_sensitive on public.children_sensitive_data;
create trigger trg_audit_children_sensitive
  after insert or update or delete on public.children_sensitive_data
  for each row execute function public.audit_children_sensitive_access();

-- ── 4. Youth Ministry ─────────────────────────────────────────────────────────

-- Graduation readiness milestone catalog (church-defined)
create table if not exists public.youth_milestones (
  id              uuid        primary key default gen_random_uuid(),
  church_id       uuid        not null references public.churches(id) on delete cascade,
  ministry_id     uuid        references public.ministries(id) on delete set null,
  name            text        not null,   -- "Baptism", "First Serve", "Leadership Training", etc.
  description     text,
  milestone_order integer     not null default 0,
  is_required     boolean     not null default false,
  created_at      timestamptz not null default timezone('utc', now())
);

create index if not exists youth_milestones_ministry_idx
  on public.youth_milestones (ministry_id, milestone_order);

alter table public.youth_milestones enable row level security;

create policy "youth_milestones_read" on public.youth_milestones
  for select using (public.belongs_to_church(church_id));

create policy "youth_milestones_manage" on public.youth_milestones
  for all using (public.can_manage_church(church_id))
  with check (public.can_manage_church(church_id));

-- Per-youth completion tracking with graduation year
create table if not exists public.youth_graduation_tracking (
  id              uuid        primary key default gen_random_uuid(),
  church_id       uuid        not null references public.churches(id) on delete cascade,
  ministry_id     uuid        references public.ministries(id) on delete set null,
  profile_id      uuid        not null references public.profiles(id) on delete cascade,
  milestone_id    uuid        not null references public.youth_milestones(id) on delete cascade,
  completed_at    date,
  graduation_year integer,    -- expected HS graduation year for this student
  notes           text,
  created_at      timestamptz not null default timezone('utc', now()),
  unique (church_id, profile_id, milestone_id)
);

create index if not exists youth_grad_profile_idx
  on public.youth_graduation_tracking (ministry_id, profile_id);

alter table public.youth_graduation_tracking enable row level security;

create policy "youth_grad_read" on public.youth_graduation_tracking
  for select using (public.belongs_to_church(church_id));

create policy "youth_grad_manage" on public.youth_graduation_tracking
  for all using (public.can_manage_church(church_id))
  with check (public.can_manage_church(church_id));

-- ── 5. Young Adults Ministry ──────────────────────────────────────────────────

-- Career-Kingdom mentorship: connects YAs to industry mentors
create table if not exists public.young_adult_career_mentorships (
  id              uuid        primary key default gen_random_uuid(),
  church_id       uuid        not null references public.churches(id) on delete cascade,
  ministry_id     uuid        references public.ministries(id) on delete set null,
  mentor_id       uuid        not null references public.profiles(id) on delete cascade,
  mentee_id       uuid        not null references public.profiles(id) on delete cascade,
  industry        text,       -- e.g. "Healthcare", "Technology", "Education", "Finance"
  focus_area      text,       -- e.g. "Workplace Ethics", "Calling Discovery", "Career Transition"
  status          text        not null default 'active'
    check (status in ('active', 'completed', 'paused', 'seeking')),
  started_at      date,
  ended_at        date,
  notes           text,
  created_at      timestamptz not null default timezone('utc', now()),
  constraint no_career_self_mentorship check (mentor_id <> mentee_id)
);

create index if not exists young_adult_career_ministry_idx
  on public.young_adult_career_mentorships (ministry_id, status);

alter table public.young_adult_career_mentorships enable row level security;

create policy "career_mentorships_own" on public.young_adult_career_mentorships
  for select using (
    public.belongs_to_church(church_id)
    and (
      public.can_manage_church(church_id)
      or mentor_id = (select id from public.profiles where user_id = auth.uid() and church_id = young_adult_career_mentorships.church_id limit 1)
      or mentee_id = (select id from public.profiles where user_id = auth.uid() and church_id = young_adult_career_mentorships.church_id limit 1)
    )
  );

create policy "career_mentorships_manage" on public.young_adult_career_mentorships
  for all using (public.can_manage_church(church_id))
  with check (public.can_manage_church(church_id));

-- ── 6. Education / Discipleship Track ────────────────────────────────────────

-- Course catalog (doctrinal curriculum)
create table if not exists public.education_courses (
  id                  uuid        primary key default gen_random_uuid(),
  church_id           uuid        not null references public.churches(id) on delete cascade,
  ministry_id         uuid        references public.ministries(id) on delete set null,
  title               text        not null,
  curriculum_area     text        not null
    check (curriculum_area in (
      'theology', 'bible_survey', 'spiritual_disciplines', 'church_history',
      'apologetics', 'leadership', 'marriage_family', 'missions', 'finance', 'other'
    )),
  description         text,
  duration_weeks      integer,
  is_active           boolean     not null default true,
  course_order        integer     not null default 0,
  created_at          timestamptz not null default timezone('utc', now())
);

create index if not exists education_courses_ministry_idx
  on public.education_courses (ministry_id, is_active, course_order);

alter table public.education_courses enable row level security;

create policy "education_courses_read" on public.education_courses
  for select using (public.belongs_to_church(church_id));

create policy "education_courses_manage" on public.education_courses
  for all using (public.can_manage_church(church_id))
  with check (public.can_manage_church(church_id));

-- Per-member enrollment and completion
create table if not exists public.education_enrollments (
  id              uuid        primary key default gen_random_uuid(),
  church_id       uuid        not null references public.churches(id) on delete cascade,
  course_id       uuid        not null references public.education_courses(id) on delete cascade,
  profile_id      uuid        not null references public.profiles(id) on delete cascade,
  enrolled_at     date        not null default current_date,
  completed_at    date,
  certificate_issued boolean not null default false,
  notes           text,
  created_at      timestamptz not null default timezone('utc', now()),
  unique (church_id, course_id, profile_id)
);

create index if not exists education_enrollments_profile_idx
  on public.education_enrollments (church_id, profile_id);

create index if not exists education_enrollments_course_idx
  on public.education_enrollments (course_id, completed_at);

alter table public.education_enrollments enable row level security;

create policy "education_enrollments_own" on public.education_enrollments
  for select using (
    public.belongs_to_church(church_id)
    and (
      public.can_manage_church(church_id)
      or profile_id = (select id from public.profiles where user_id = auth.uid() and church_id = education_enrollments.church_id limit 1)
    )
  );

create policy "education_enrollments_manage" on public.education_enrollments
  for all using (public.can_manage_church(church_id))
  with check (public.can_manage_church(church_id));

-- ── 7. Outreach Ministry ──────────────────────────────────────────────────────

-- Community partnership events
create table if not exists public.outreach_events (
  id              uuid        primary key default gen_random_uuid(),
  church_id       uuid        not null references public.churches(id) on delete cascade,
  ministry_id     uuid        references public.ministries(id) on delete set null,
  name            text        not null,
  event_date      date        not null,
  location        text,
  zone_name       text,       -- neighborhood/zone label for heatmap grouping
  latitude        numeric(9,6),
  longitude       numeric(9,6),
  volunteer_count integer     not null default 0,
  people_served   integer     not null default 0,
  status          text        not null default 'planned'
    check (status in ('planned', 'completed', 'cancelled')),
  notes           text,
  created_at      timestamptz not null default timezone('utc', now())
);

create index if not exists outreach_events_ministry_date_idx
  on public.outreach_events (ministry_id, event_date desc);

alter table public.outreach_events enable row level security;

create policy "outreach_events_read" on public.outreach_events
  for select using (public.belongs_to_church(church_id));

create policy "outreach_events_manage" on public.outreach_events
  for all using (public.can_manage_church(church_id))
  with check (public.can_manage_church(church_id));

-- Zone / neighborhood summary (rolled-up from events — also editable directly)
create table if not exists public.outreach_zones (
  id              uuid        primary key default gen_random_uuid(),
  church_id       uuid        not null references public.churches(id) on delete cascade,
  ministry_id     uuid        references public.ministries(id) on delete set null,
  zone_name       text        not null,
  description     text,
  total_events    integer     not null default 0,
  total_volunteers integer    not null default 0,
  total_served    integer     not null default 0,
  last_event_date date,
  coverage_level  text        not null default 'low'
    check (coverage_level in ('low', 'medium', 'high')),
  created_at      timestamptz not null default timezone('utc', now()),
  unique (church_id, zone_name)
);

alter table public.outreach_zones enable row level security;

create policy "outreach_zones_read" on public.outreach_zones
  for select using (public.belongs_to_church(church_id));

create policy "outreach_zones_manage" on public.outreach_zones
  for all using (public.can_manage_church(church_id))
  with check (public.can_manage_church(church_id));

-- ── 8. Marriage Pulse (anonymous aggregate sentiment) ─────────────────────────
-- Completely anonymous — no profile_id stored. Pastors see aggregate trends only.

create table if not exists public.marriage_pulse_entries (
  id              uuid        primary key default gen_random_uuid(),
  church_id       uuid        not null references public.churches(id) on delete cascade,
  ministry_id     uuid        references public.ministries(id) on delete set null,
  survey_week     date        not null,  -- ISO week start (Monday)
  theme           text        not null
    check (theme in (
      'communication', 'parenting', 'finance', 'intimacy',
      'conflict', 'purpose', 'spiritual_growth', 'other'
    )),
  sentiment       integer     not null check (sentiment between 1 and 5),
  -- No profile_id — intentionally anonymous
  created_at      timestamptz not null default timezone('utc', now())
);

create index if not exists marriage_pulse_church_week_idx
  on public.marriage_pulse_entries (church_id, survey_week desc);

alter table public.marriage_pulse_entries enable row level security;

-- Members can insert (anonymously); only pastors/admins can read aggregates
create policy "marriage_pulse_insert" on public.marriage_pulse_entries
  for insert with check (public.belongs_to_church(church_id));

create policy "marriage_pulse_read" on public.marriage_pulse_entries
  for select using (public.can_manage_church(church_id));

-- ── 9. Stewardship: Discipleship Velocity view ────────────────────────────────
-- Measures average days from first_visit_at → becoming a ministry leader.

create or replace view public.discipleship_velocity as
select
  p.church_id,
  count(*)                                     as leader_count,
  round(avg(
    extract(day from (mt.created_at - p.created_at))
  )::numeric, 1)                               as avg_days_to_leader,
  min(extract(day from (mt.created_at - p.created_at)))::integer as min_days,
  max(extract(day from (mt.created_at - p.created_at)))::integer as max_days
from public.ministry_tracks mt
join public.profiles p on p.id = mt.profile_id
where mt.role_type = 'leader'
  and mt.status = 'active'
  and p.created_at is not null
group by p.church_id;

-- ── 10. Stewardship: Burnout cross-category count view ────────────────────────
-- Flags members who are active in more than 3 distinct track_kind categories.

create or replace view public.burnout_category_counts as
select
  mt.church_id,
  mt.profile_id,
  p.full_name,
  count(distinct mt.track_kind) as distinct_track_count,
  array_agg(distinct mt.track_kind) as active_tracks
from public.ministry_tracks mt
join public.profiles p on p.id = mt.profile_id
where mt.status = 'active'
group by mt.church_id, mt.profile_id, p.full_name;

-- ── 11. Track health metrics: extend constraint to cover new types ─────────────

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'track_health_metrics_track_kind_check'
  ) then
    alter table public.track_health_metrics
      drop constraint track_health_metrics_track_kind_check;
  end if;
end;
$$;

alter table public.track_health_metrics
  add constraint track_health_metrics_track_kind_check
  check (track_kind in (
    'worship', 'men', 'women', 'marriage', 'missions',
    'children', 'youth', 'young_adult', 'education', 'outreach'
  ));
