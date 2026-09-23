-- ============================================================
-- Role Taxonomy & Team Roster (Service Planning, Story 2)
-- Adds a church-wide catalog of reusable service-plan role types
-- (e.g. "Sound Tech", "Greeter") with required-skill tagging, and
-- migrates service_plan_positions from a freeform role_name text
-- column to a role_type_id foreign key. role_name is kept as a
-- legacy/nullable column (no longer written for new positions) —
-- display name is resolved via a live join to
-- service_plan_role_types.name going forward. volunteer_shifts.title
-- remains an untouched, point-in-time snapshot of the role name at
-- assignment time (same pattern as Story 1's service_plan_items song
-- snapshot fields) — role-type renames never rewrite already-assigned
-- shift history.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Church-wide service plan role type catalog
-- ------------------------------------------------------------

create table if not exists public.service_plan_role_types (
  id               uuid primary key default gen_random_uuid(),
  church_id        uuid not null references public.churches(id) on delete cascade,
  name             text not null,
  description      text,
  required_skills  text[] not null default '{}',
  is_active        boolean not null default true,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default timezone('utc', now()),
  updated_at       timestamptz not null default timezone('utc', now())
);

create index if not exists spr_types_church_id_idx
  on public.service_plan_role_types (church_id);

-- Case-insensitive uniqueness among ACTIVE rows only — a deactivated role
-- type's name can be reused by a new active role type, matching
-- song_library's church_idempotency_key partial-unique-index pattern
-- (Story 1). Any raw-SQL ON CONFLICT targeting this index (local-fallback
-- path) must repeat the same `where is_active` predicate to be usable as
-- an arbiter, per that same precedent.
create unique index if not exists spr_types_church_lower_name_active_idx
  on public.service_plan_role_types (church_id, lower(name))
  where is_active;

alter table public.service_plan_role_types enable row level security;

drop policy if exists "service_plan_role_types_manage" on public.service_plan_role_types;
create policy "service_plan_role_types_manage"
  on public.service_plan_role_types for all
  to authenticated
  using (public.can_manage_church(church_id))
  with check (public.can_manage_church(church_id));

drop policy if exists "service_plan_role_types_select_member" on public.service_plan_role_types;
create policy "service_plan_role_types_select_member"
  on public.service_plan_role_types for select
  to authenticated
  using (public.belongs_to_church(church_id));

-- ------------------------------------------------------------
-- 2) service_plan_positions: role_type_id column (nullable at first —
--    made NOT NULL below, after backfill)
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'service_plan_positions'
      and column_name  = 'role_type_id'
  ) then
    alter table public.service_plan_positions
      add column role_type_id uuid;
  end if;
end $$;

create index if not exists spp_role_type_id_idx
  on public.service_plan_positions (role_type_id);

-- ------------------------------------------------------------
-- 3) Backfill: one role type per distinct (church_id, role_name)
--    spelling, then point every existing position at it.
--    Must run before role_type_id is made NOT NULL.
-- ------------------------------------------------------------

-- Blank/whitespace-only legacy role_name values are coalesced to the
-- literal 'Unnamed Role' so no position is silently dropped from the
-- backfill. DISTINCT ON + a deterministic ORDER BY (there is no
-- created_at on service_plan_positions to establish true chronological
-- first-seen order) makes case-only spelling collisions collapse onto a
-- single winning spelling per church, while genuinely different spellings
-- (e.g. "Sound Tech" vs "Sound Techs") remain distinct role types. The
-- trailing ON CONFLICT is a re-run/idempotency safety net, not the
-- primary de-duplication mechanism — the DISTINCT ON already guarantees
-- at most one row per (church_id, lower(name)) pair from this query.
insert into public.service_plan_role_types (church_id, name)
select distinct on (spp.church_id, lower(coalesce(nullif(trim(spp.role_name), ''), 'Unnamed Role')))
       spp.church_id,
       coalesce(nullif(trim(spp.role_name), ''), 'Unnamed Role') as name
from public.service_plan_positions spp
order by spp.church_id,
         lower(coalesce(nullif(trim(spp.role_name), ''), 'Unnamed Role')),
         spp.role_name
on conflict (church_id, lower(name)) where is_active do nothing;

update public.service_plan_positions spp
set role_type_id = spr.id
from public.service_plan_role_types spr
where spr.church_id = spp.church_id
  and lower(spr.name) = lower(coalesce(nullif(trim(spp.role_name), ''), 'Unnamed Role'))
  and spp.role_type_id is null;

-- Only after the backfill above — if anything were left unmapped this
-- fails loudly (correct behavior: surfaces a bug rather than shipping an
-- orphaned position).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'service_plan_positions'
      and column_name  = 'role_type_id'
      and is_nullable  = 'YES'
  ) then
    alter table public.service_plan_positions
      alter column role_type_id set not null;
  end if;
end $$;

-- FK added last (guarded, named, existence-checked) — defensive-only:
-- soft-delete (is_active = false) is the only supported deactivation path
-- for a role type, so ON DELETE RESTRICT should never actually fire. It
-- exists so an accidental hard-delete of a role type fails loudly instead
-- of silently orphaning positions.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'service_plan_positions_role_type_id_fkey'
  ) then
    alter table public.service_plan_positions
      add constraint service_plan_positions_role_type_id_fkey
      foreign key (role_type_id) references public.service_plan_role_types(id) on delete restrict;
  end if;
end $$;

-- role_name itself is intentionally left in place as a nullable legacy
-- column — dropping it is out of scope for this migration (follow-up
-- cleanup). New positions no longer write to it; role_type_id is the sole
-- source of truth going forward and display name is always resolved via a
-- live join to service_plan_role_types.name.
--
-- The original 20260504000000_volunteer_scheduling.sql migration defined
-- role_name as NOT NULL. It must be relaxed to nullable here — new
-- positions inserted via addPlanPositionAction no longer supply it, and a
-- lingering NOT NULL would reject every future insert.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'service_plan_positions'
      and column_name  = 'role_name'
      and is_nullable  = 'NO'
  ) then
    alter table public.service_plan_positions
      alter column role_name drop not null;
  end if;
end $$;
