-- ─────────────────────────────────────────────────────────────────────────────
-- Ministry Tracks Phase 4
-- Adds: worship / men / women / marriage to ministry_type constraint,
--       ministry_tracks longitudinal table,
--       track_health_metrics time-series table,
--       worship-specific tables (set_list_songs, rehearsal_schedule),
--       men-specific tables (mentorship_pairs, discipleship_groups),
--       women-specific tables (life_stage_circles, support_pairings),
--       marriage-specific tables (mentor_couples, marriage_cohorts),
--       missions-specific tables (mission_partners, mission_trips).
-- All tables are church-scoped with RLS and audit triggers where sensitive.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Extend ministries.ministry_type to include new track types ────────────

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
      'outreach',
      'discipleship',
      'worship',
      'care',
      'administration',
      'youth',
      'children',
      'missions',
      'men',
      'women',
      'marriage'
    )
  );

-- ── 2. ministry_tracks ────────────────────────────────────────────────────────
-- Longitudinal pathway membership per person per church

create table if not exists public.ministry_tracks (
  id          uuid        primary key default gen_random_uuid(),
  church_id   uuid        not null references public.churches(id) on delete cascade,
  profile_id  uuid        not null references public.profiles(id) on delete cascade,
  ministry_id uuid        references public.ministries(id) on delete set null,
  track_kind  text        not null
    check (track_kind in (
      'worship', 'men', 'women', 'marriage', 'missions',
      'children', 'youth', 'young_adult', 'education', 'outreach'
    )),
  role_type   text        not null default 'member'
    check (role_type in ('member', 'leader', 'pastor')),
  status      text        not null default 'active'
    check (status in ('active', 'historical')),
  notes       text,
  start_date  date,
  end_date    date,
  created_at  timestamptz not null default timezone('utc', now()),
  updated_at  timestamptz not null default timezone('utc', now())
);

create index if not exists ministry_tracks_church_profile_idx
  on public.ministry_tracks (church_id, profile_id);

create index if not exists ministry_tracks_kind_idx
  on public.ministry_tracks (church_id, track_kind, status);

alter table public.ministry_tracks enable row level security;

create policy "ministry_tracks_read" on public.ministry_tracks
  for select using (public.belongs_to_church(church_id));

create policy "ministry_tracks_manage" on public.ministry_tracks
  for all using (public.can_manage_church(church_id))
  with check (public.can_manage_church(church_id));

-- ── 3. track_health_metrics ──────────────────────────────────────────────────
-- Time-series MVS snapshots per track per church

create table if not exists public.track_health_metrics (
  id                          uuid        primary key default gen_random_uuid(),
  church_id                   uuid        not null references public.churches(id) on delete cascade,
  track_kind                  text        not null
    check (track_kind in (
      'worship', 'men', 'women', 'marriage', 'missions',
      'children', 'youth', 'young_adult', 'education', 'outreach'
    )),
  vitality_score              numeric(5,2) not null default 0,
  retention_rate              numeric(5,2) not null default 0,
  engagement_rate             numeric(5,2) not null default 0,
  leader_to_member_ratio      numeric(6,3) not null default 0,
  active_member_count         integer      not null default 0,
  leader_pipeline_velocity_days integer,
  calculated_at               timestamptz  not null default timezone('utc', now())
);

create index if not exists track_health_church_kind_idx
  on public.track_health_metrics (church_id, track_kind, calculated_at desc);

alter table public.track_health_metrics enable row level security;

create policy "track_health_read" on public.track_health_metrics
  for select using (public.can_manage_church(church_id));

create policy "track_health_insert" on public.track_health_metrics
  for insert with check (public.can_manage_church(church_id));

-- ── 4. Worship-specific tables ────────────────────────────────────────────────

create table if not exists public.worship_songs (
  id           uuid        primary key default gen_random_uuid(),
  church_id    uuid        not null references public.churches(id) on delete cascade,
  ministry_id  uuid        not null references public.ministries(id) on delete cascade,
  title        text        not null,
  artist       text,
  song_key     text,
  tempo        text,
  tags         text[]      not null default '{}',
  last_used_at date,
  created_at   timestamptz not null default timezone('utc', now())
);

create index if not exists worship_songs_ministry_idx
  on public.worship_songs (ministry_id, last_used_at desc);

alter table public.worship_songs enable row level security;

create policy "worship_songs_read" on public.worship_songs
  for select using (public.belongs_to_church(church_id));

create policy "worship_songs_manage" on public.worship_songs
  for all using (public.can_manage_church(church_id))
  with check (public.can_manage_church(church_id));

create table if not exists public.worship_rehearsals (
  id           uuid        primary key default gen_random_uuid(),
  church_id    uuid        not null references public.churches(id) on delete cascade,
  ministry_id  uuid        not null references public.ministries(id) on delete cascade,
  scheduled_at timestamptz not null,
  notes        text,
  song_ids     uuid[]      not null default '{}',
  rsvp_count   integer     not null default 0,
  created_at   timestamptz not null default timezone('utc', now())
);

create index if not exists worship_rehearsals_ministry_idx
  on public.worship_rehearsals (ministry_id, scheduled_at desc);

alter table public.worship_rehearsals enable row level security;

create policy "worship_rehearsals_read" on public.worship_rehearsals
  for select using (public.belongs_to_church(church_id));

create policy "worship_rehearsals_manage" on public.worship_rehearsals
  for all using (public.can_manage_church(church_id))
  with check (public.can_manage_church(church_id));

-- ── 5. Men's Ministry tables ──────────────────────────────────────────────────

create table if not exists public.mentorship_pairs (
  id           uuid        primary key default gen_random_uuid(),
  church_id    uuid        not null references public.churches(id) on delete cascade,
  ministry_id  uuid        references public.ministries(id) on delete set null,
  mentor_id    uuid        not null references public.profiles(id) on delete cascade,
  mentee_id    uuid        not null references public.profiles(id) on delete cascade,
  status       text        not null default 'active'
    check (status in ('active', 'completed', 'paused', 'seeking')),
  started_at   date,
  ended_at     date,
  notes        text,                               -- pastor-scoped sensitive field
  created_at   timestamptz not null default timezone('utc', now()),
  constraint no_self_mentorship check (mentor_id <> mentee_id)
);

create index if not exists mentorship_pairs_ministry_idx
  on public.mentorship_pairs (ministry_id, status);

alter table public.mentorship_pairs enable row level security;

-- Members can see their own pairs; managers see all
create policy "mentorship_pairs_own" on public.mentorship_pairs
  for select using (
    public.belongs_to_church(church_id)
    and (
      public.can_manage_church(church_id)
      or mentor_id  = (select id from public.profiles where user_id = auth.uid() and church_id = mentorship_pairs.church_id limit 1)
      or mentee_id  = (select id from public.profiles where user_id = auth.uid() and church_id = mentorship_pairs.church_id limit 1)
    )
  );

create policy "mentorship_pairs_manage" on public.mentorship_pairs
  for all using (public.can_manage_church(church_id))
  with check (public.can_manage_church(church_id));

create table if not exists public.discipleship_groups (
  id           uuid        primary key default gen_random_uuid(),
  church_id    uuid        not null references public.churches(id) on delete cascade,
  ministry_id  uuid        references public.ministries(id) on delete set null,
  name         text        not null,
  leader_id    uuid        references public.profiles(id) on delete set null,
  cadence      text,       -- e.g. "Weekly, Tuesday 7pm"
  is_open      boolean     not null default true,
  member_ids   uuid[]      not null default '{}',
  created_at   timestamptz not null default timezone('utc', now())
);

alter table public.discipleship_groups enable row level security;

create policy "discipleship_groups_read" on public.discipleship_groups
  for select using (public.belongs_to_church(church_id));

create policy "discipleship_groups_manage" on public.discipleship_groups
  for all using (public.can_manage_church(church_id))
  with check (public.can_manage_church(church_id));

-- ── 6. Women's Ministry tables ────────────────────────────────────────────────

create table if not exists public.life_stage_circles (
  id           uuid        primary key default gen_random_uuid(),
  church_id    uuid        not null references public.churches(id) on delete cascade,
  ministry_id  uuid        references public.ministries(id) on delete set null,
  name         text        not null,
  life_stage   text        not null
    check (life_stage in (
      'new_mom', 'young_woman', 'single_woman', 'married',
      'empty_nester', 'widow', 'senior', 'general'
    )),
  leader_id    uuid        references public.profiles(id) on delete set null,
  member_ids   uuid[]      not null default '{}',
  meeting_cadence text,
  created_at   timestamptz not null default timezone('utc', now())
);

alter table public.life_stage_circles enable row level security;

create policy "life_stage_circles_read" on public.life_stage_circles
  for select using (public.belongs_to_church(church_id));

create policy "life_stage_circles_manage" on public.life_stage_circles
  for all using (public.can_manage_church(church_id))
  with check (public.can_manage_church(church_id));

create table if not exists public.support_pairings (
  id             uuid        primary key default gen_random_uuid(),
  church_id      uuid        not null references public.churches(id) on delete cascade,
  ministry_id    uuid        references public.ministries(id) on delete set null,
  supporter_id   uuid        not null references public.profiles(id) on delete cascade,
  supported_id   uuid        not null references public.profiles(id) on delete cascade,
  pairing_reason text,       -- interest/season tag, not sensitive data
  status         text        not null default 'active'
    check (status in ('active', 'completed', 'pending')),
  created_at     timestamptz not null default timezone('utc', now()),
  constraint no_self_pairing check (supporter_id <> supported_id)
);

alter table public.support_pairings enable row level security;

create policy "support_pairings_own" on public.support_pairings
  for select using (
    public.belongs_to_church(church_id)
    and (
      public.can_manage_church(church_id)
      or supporter_id = (select id from public.profiles where user_id = auth.uid() and church_id = support_pairings.church_id limit 1)
      or supported_id = (select id from public.profiles where user_id = auth.uid() and church_id = support_pairings.church_id limit 1)
    )
  );

create policy "support_pairings_manage" on public.support_pairings
  for all using (public.can_manage_church(church_id))
  with check (public.can_manage_church(church_id));

-- ── 7. Marriage Ministry tables ───────────────────────────────────────────────

create table if not exists public.mentor_couples (
  id              uuid        primary key default gen_random_uuid(),
  church_id       uuid        not null references public.churches(id) on delete cascade,
  ministry_id     uuid        references public.ministries(id) on delete set null,
  partner1_id     uuid        not null references public.profiles(id) on delete cascade,
  partner2_id     uuid        references public.profiles(id) on delete set null,
  couple_name     text,
  years_married   integer,
  is_available    boolean     not null default true,
  cohort_focus    text,       -- e.g. "newlywed", "1-5 years", "25+"
  created_at      timestamptz not null default timezone('utc', now())
);

alter table public.mentor_couples enable row level security;

-- Marriage data is sensitive — only managers and pastors
create policy "mentor_couples_manage" on public.mentor_couples
  for all using (public.can_manage_church(church_id))
  with check (public.can_manage_church(church_id));

create table if not exists public.marriage_cohorts (
  id              uuid        primary key default gen_random_uuid(),
  church_id       uuid        not null references public.churches(id) on delete cascade,
  ministry_id     uuid        references public.ministries(id) on delete set null,
  name            text        not null,
  cohort_stage    text        not null
    check (cohort_stage in ('newlywed', '1_5_years', '5_15_years', '15_25_years', '25_plus')),
  mentor_couple_id uuid       references public.mentor_couples(id) on delete set null,
  couple_ids      uuid[]      not null default '{}',  -- mentor_couples ids
  created_at      timestamptz not null default timezone('utc', now())
);

alter table public.marriage_cohorts enable row level security;

create policy "marriage_cohorts_manage" on public.marriage_cohorts
  for all using (public.can_manage_church(church_id))
  with check (public.can_manage_church(church_id));

-- ── 8. Missions tables ────────────────────────────────────────────────────────

create table if not exists public.mission_partners (
  id              uuid        primary key default gen_random_uuid(),
  church_id       uuid        not null references public.churches(id) on delete cascade,
  ministry_id     uuid        references public.ministries(id) on delete set null,
  name            text        not null,
  region          text,
  focus_area      text,
  relationship_status text    not null default 'active'
    check (relationship_status in ('active', 'inactive', 'prospective')),
  contact_name    text,
  contact_email   text,
  notes           text,
  created_at      timestamptz not null default timezone('utc', now())
);

alter table public.mission_partners enable row level security;

create policy "mission_partners_read" on public.mission_partners
  for select using (public.belongs_to_church(church_id));

create policy "mission_partners_manage" on public.mission_partners
  for all using (public.can_manage_church(church_id))
  with check (public.can_manage_church(church_id));

create table if not exists public.mission_trips (
  id              uuid        primary key default gen_random_uuid(),
  church_id       uuid        not null references public.churches(id) on delete cascade,
  ministry_id     uuid        references public.ministries(id) on delete set null,
  partner_id      uuid        references public.mission_partners(id) on delete set null,
  name            text        not null,
  destination     text,
  departs_at      date,
  returns_at      date,
  status          text        not null default 'planning'
    check (status in ('planning', 'confirmed', 'in_progress', 'completed', 'cancelled')),
  participant_ids uuid[]      not null default '{}',
  hours_served    integer     not null default 0,
  people_reached  integer     not null default 0,
  impact_notes    text,
  created_at      timestamptz not null default timezone('utc', now())
);

create index if not exists mission_trips_ministry_idx
  on public.mission_trips (ministry_id, departs_at desc);

alter table public.mission_trips enable row level security;

create policy "mission_trips_read" on public.mission_trips
  for select using (public.belongs_to_church(church_id));

create policy "mission_trips_manage" on public.mission_trips
  for all using (public.can_manage_church(church_id))
  with check (public.can_manage_church(church_id));

-- ── 9. Audit trigger for mentorship_pairs (sensitive) ─────────────────────────

create or replace function public.audit_mentorship_pairs()
returns trigger language plpgsql security definer as $$
begin
  insert into public.audit_log (table_name, record_id, operation, changed_by, changed_at)
  values (
    'mentorship_pairs',
    coalesce(new.id, old.id),
    tg_op,
    auth.uid(),
    timezone('utc', now())
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_audit_mentorship_pairs on public.mentorship_pairs;
create trigger trg_audit_mentorship_pairs
  after insert or update or delete on public.mentorship_pairs
  for each row execute function public.audit_mentorship_pairs();
