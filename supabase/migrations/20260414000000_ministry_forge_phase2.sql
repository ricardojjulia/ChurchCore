-- ============================================================
-- Ministry Forge — Phase 2: Health Score Foundations
-- Ref: advanced_ministry_elder_pastor.md §2, §3
--
-- Adds health_score and last_health_assessment to ministries.
-- Creates ministry_health_history for trend tracking.
-- Creates kingdom_impacts for quick-log spiritual outcomes.
--
-- RLS uses the composable helper functions from the platform
-- foundation (belongs_to_church, can_manage_church).
-- ============================================================

-- Health score fields on ministries (idempotent)
alter table public.ministries
  add column if not exists health_score           numeric(4,2) not null default 0.00,
  add column if not exists last_health_assessment timestamptz;

-- --------------------------------------------------------
-- ministry_health_history — one row per assessment run
-- --------------------------------------------------------
create table if not exists public.ministry_health_history (
  id              uuid        primary key default gen_random_uuid(),
  ministry_id     uuid        not null references public.ministries(id) on delete cascade,
  church_id       uuid        not null references public.churches(id) on delete cascade,
  health_score    numeric(4,2) not null,
  assessment_date timestamptz not null default timezone('utc', now()),
  notes           text,
  created_at      timestamptz not null default timezone('utc', now())
);

create index if not exists ministry_health_history_ministry_id_idx
  on public.ministry_health_history (ministry_id, assessment_date desc);

create index if not exists ministry_health_history_church_id_idx
  on public.ministry_health_history (church_id);

alter table public.ministry_health_history enable row level security;

-- Leaders and management can view health history within their church
create policy "ministry_health_history_select_scope"
  on public.ministry_health_history for select
  to authenticated
  using (public.belongs_to_church(church_id));

-- Only management can write health history
create policy "ministry_health_history_manage_scope"
  on public.ministry_health_history for all
  to authenticated
  using (public.can_manage_church(church_id))
  with check (public.can_manage_church(church_id));

-- --------------------------------------------------------
-- kingdom_impacts — quick-log spiritual outcome entries
-- --------------------------------------------------------
create table if not exists public.kingdom_impacts (
  id          uuid        primary key default gen_random_uuid(),
  church_id   uuid        not null references public.churches(id) on delete cascade,
  ministry_id uuid        references public.ministries(id) on delete set null,
  profile_id  uuid        references public.profiles(id) on delete set null,
  created_by  uuid        references public.profiles(id) on delete set null,
  impact_type text        not null
    check (
      impact_type in (
        'prayer_answered',
        'disciple_made',
        'salvation',
        'restored_relationship'
      )
    ),
  description text,
  occurred_at timestamptz not null default timezone('utc', now()),
  created_at  timestamptz not null default timezone('utc', now())
);

create index if not exists kingdom_impacts_church_id_idx
  on public.kingdom_impacts (church_id);

create index if not exists kingdom_impacts_ministry_id_idx
  on public.kingdom_impacts (ministry_id);

create index if not exists kingdom_impacts_occurred_at_idx
  on public.kingdom_impacts (occurred_at desc);

alter table public.kingdom_impacts enable row level security;

-- All church members can view impact stories in their church
create policy "kingdom_impacts_select_scope"
  on public.kingdom_impacts for select
  to authenticated
  using (public.belongs_to_church(church_id));

-- Management can create, update, delete impacts
create policy "kingdom_impacts_manage_scope"
  on public.kingdom_impacts for all
  to authenticated
  using (public.can_manage_church(church_id))
  with check (public.can_manage_church(church_id));
