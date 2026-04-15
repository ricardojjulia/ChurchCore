-- ============================================================
-- Ministry Forge — Phase 3: AI Volunteer Matcher + Burnout Guardian
-- Ref: advanced_ministry_elder_pastor.md §3, §6, §9
-- Ref: churchgoer_data.md §2 (spiritual_gifts, contact_allowed,
--      directory_visible)
--
-- This migration adds:
--   1. profiles.current_ministry_load  — denormalised load count
--   2. volunteer_match_suggestions     — AI-generated match storage
--   3. burnout_alerts                  — alert log with severity
--
-- AI guardrails:
--   - Suggestions are always "pending" until a human approves.
--   - Approval writes to profile_ministries (existing table).
--   - No AI row can automatically mutate ministry membership.
--   - Full audit trail via created_at / reviewed_at timestamps.
--   - RLS restricts all rows to the originating church.
-- ============================================================

-- ── 1. Load counter on profiles ─────────────────────────────
alter table public.profiles
  add column if not exists current_ministry_load int not null default 0;

-- Backfill from profile_ministries
update public.profiles p
set current_ministry_load = (
  select count(*)
  from public.profile_ministries pm
  where pm.profile_id = p.id
)
where current_ministry_load = 0;

-- Index for burnout queries
create index if not exists profiles_ministry_load_idx
  on public.profiles (current_ministry_load);

-- ── 2. volunteer_match_suggestions ──────────────────────────
-- Stores AI-generated volunteer recommendations for a ministry.
-- A human must approve (status → 'approved') before any
-- profile_ministries record is created.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.volunteer_match_suggestions (
  id           uuid        primary key default gen_random_uuid(),
  church_id    uuid        not null references public.churches(id) on delete cascade,
  ministry_id  uuid        not null references public.ministries(id) on delete cascade,
  profile_id   uuid        not null references public.profiles(id) on delete cascade,
  match_score  numeric(5,2) not null check (match_score between 0 and 100),
  reason_text  text,
  ai_generated boolean     not null default true,
  reviewed_by  uuid        references public.profiles(id),
  reviewed_at  timestamptz,
  status       text        not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  created_at   timestamptz not null default timezone('utc', now())
);

-- Prevent duplicate pending suggestions for the same person+ministry
create unique index if not exists volunteer_match_suggestions_pending_unique_idx
  on public.volunteer_match_suggestions (church_id, ministry_id, profile_id)
  where status = 'pending';

create index if not exists volunteer_match_suggestions_church_idx
  on public.volunteer_match_suggestions (church_id);

create index if not exists volunteer_match_suggestions_ministry_idx
  on public.volunteer_match_suggestions (ministry_id, status);

create index if not exists volunteer_match_suggestions_profile_idx
  on public.volunteer_match_suggestions (profile_id);

alter table public.volunteer_match_suggestions enable row level security;

-- All members of the church can see suggestions (leaders review them in the UI)
create policy "volunteer_suggestions_select_church_scope"
  on public.volunteer_match_suggestions for select
  to authenticated
  using (public.belongs_to_church(church_id));

-- Only management roles (church_admin, pastor_elder, ministry_leader) may
-- create, update, or delete suggestions.
create policy "volunteer_suggestions_manage_scope"
  on public.volunteer_match_suggestions for all
  to authenticated
  using (public.can_manage_church(church_id))
  with check (public.can_manage_church(church_id));

-- ── 3. burnout_alerts ───────────────────────────────────────
-- Persists burnout alert events for history, trend analysis,
-- and acknowledgment tracking.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.burnout_alerts (
  id           uuid        primary key default gen_random_uuid(),
  church_id    uuid        not null references public.churches(id) on delete cascade,
  profile_id   uuid        not null references public.profiles(id) on delete cascade,
  ministry_id  uuid        references public.ministries(id) on delete set null,
  alert_type   text        not null
    check (alert_type in ('high_load', 'overlapping_events', 'rest_needed')),
  message      text        not null,
  severity     text        not null default 'medium'
    check (severity in ('low', 'medium', 'high')),
  acknowledged boolean     not null default false,
  created_at   timestamptz not null default timezone('utc', now())
);

create index if not exists burnout_alerts_church_idx
  on public.burnout_alerts (church_id);

create index if not exists burnout_alerts_profile_idx
  on public.burnout_alerts (profile_id, created_at desc);

create index if not exists burnout_alerts_ministry_idx
  on public.burnout_alerts (ministry_id);

alter table public.burnout_alerts enable row level security;

-- All church members can see burnout alerts (pastoral visibility)
create policy "burnout_alerts_select_church_scope"
  on public.burnout_alerts for select
  to authenticated
  using (public.belongs_to_church(church_id));

-- Management roles may create and update alerts
create policy "burnout_alerts_manage_scope"
  on public.burnout_alerts for all
  to authenticated
  using (public.can_manage_church(church_id))
  with check (public.can_manage_church(church_id));

-- ── 4. Trigger: keep current_ministry_load in sync ──────────
-- Auto-update profiles.current_ministry_load whenever
-- profile_ministries rows are inserted or deleted.
-- ─────────────────────────────────────────────────────────────
create or replace function public.sync_ministry_load()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    update public.profiles
    set current_ministry_load = current_ministry_load + 1
    where id = NEW.profile_id;
    return NEW;
  elsif TG_OP = 'DELETE' then
    update public.profiles
    set current_ministry_load = greatest(current_ministry_load - 1, 0)
    where id = OLD.profile_id;
    return OLD;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_sync_ministry_load on public.profile_ministries;

create trigger trg_sync_ministry_load
  after insert or delete
  on public.profile_ministries
  for each row
  execute function public.sync_ministry_load();
