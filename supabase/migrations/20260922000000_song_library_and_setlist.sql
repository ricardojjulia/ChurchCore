-- ============================================================
-- Song Library & Setlist Builder (Service Planning, Story 1)
-- Adds a church-wide song library, an optional link from
-- service_plan_items back to a library entry, a per-church
-- "recently used" repeat-window setting, and idempotency-key
-- support so retried song-creation requests never fork a song
-- into two library rows.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Church-wide song library
-- ------------------------------------------------------------

create table if not exists public.song_library (
  id                        uuid primary key default gen_random_uuid(),
  church_id                 uuid not null references public.churches(id) on delete cascade,
  title                     text not null,
  artist                    text,
  default_key               text,
  default_duration_seconds  int,
  last_used_date            date,
  notes                     text,
  idempotency_key           text,
  created_by                uuid references public.profiles(id) on delete set null,
  created_at                timestamptz not null default timezone('utc', now()),
  updated_at                timestamptz not null default timezone('utc', now())
);

create index if not exists song_library_church_id_idx
  on public.song_library (church_id);

-- Case-insensitive search support without pg_trgm (not enabled in this repo;
-- introducing a new Postgres extension is out of scope for this story).
create index if not exists song_library_title_lower_idx
  on public.song_library (lower(title));

create index if not exists song_library_artist_lower_idx
  on public.song_library (lower(artist));

-- Client-generated idempotency key, scoped per church. Lets the server action
-- do `insert ... on conflict (church_id, idempotency_key) do nothing` followed
-- by a select, making retried "create song" calls safe without merging
-- distinct songs that happen to share a title/artist.
--
-- This index is partial (`where idempotency_key is not null`), so any ON
-- CONFLICT clause that targets it (raw SQL on the local-fallback path) must
-- repeat that same predicate to be usable as an arbiter — confirmed live:
-- `on conflict (church_id, idempotency_key) do nothing` alone raises
-- Postgres error 42P10 ("no unique or exclusion constraint matching the ON
-- CONFLICT specification"); adding `where idempotency_key is not null`
-- before `do nothing` fixes it. Supabase-js's `.upsert(...,{onConflict})`
-- has no way to add that predicate at all (PostgREST only emits a bare
-- column-list ON CONFLICT target), so the Supabase-path server action does
-- NOT use upsert — it does a plain `.insert()` and treats a resulting
-- Postgres 23505 (unique_violation) as "already created by a prior attempt",
-- which is race-safe and was verified against a live local PostgREST
-- instance (returns 201 then 409/23505 on retry, as expected).
create unique index if not exists song_library_church_idempotency_key_idx
  on public.song_library (church_id, idempotency_key)
  where idempotency_key is not null;

alter table public.song_library enable row level security;

-- No field-level encryption: song title/artist/key/duration are not PII.

drop policy if exists "song_library_manage" on public.song_library;
create policy "song_library_manage"
  on public.song_library for all
  to authenticated
  using (public.can_manage_church(church_id))
  with check (public.can_manage_church(church_id));

drop policy if exists "song_library_select_member" on public.song_library;
create policy "song_library_select_member"
  on public.song_library for select
  to authenticated
  using (public.belongs_to_church(church_id));

-- ------------------------------------------------------------
-- 2) service_plan_items: optional link back to the library
-- ------------------------------------------------------------
-- song_key / artist / duration_seconds (added in
-- 20260602000000_ws_c1_service_plan_items_song_fields.sql) remain a
-- per-item snapshot copied at insert time, not a live join, so a library
-- edit never silently rewrites history on already-planned services.
-- No constraint ties item_type = 'song' to song_library_id being set —
-- freeform one-off songs without a library link must remain valid.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'service_plan_items'
      and column_name  = 'song_library_id'
  ) then
    alter table public.service_plan_items
      add column song_library_id uuid references public.song_library(id) on delete set null;
  end if;
end $$;

-- ------------------------------------------------------------
-- 3) churches: per-church repeat-window setting (weeks)
-- ------------------------------------------------------------
-- Read/write access is already covered by the existing
-- churches_select_member_scope / churches_update_management_scope RLS
-- policies (20260409180000_initial_platform_foundation.sql) — both are
-- already gated correctly (member-scope select, can_manage_church-equivalent
-- update), so no new RLS is needed for this column.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'churches'
      and column_name  = 'song_repeat_window_weeks'
  ) then
    alter table public.churches
      add column song_repeat_window_weeks int not null default 12;
  end if;
end $$;
