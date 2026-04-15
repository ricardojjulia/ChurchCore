-- ============================================================
-- Phase 4: Elders Discernment Room + Pastor Council Forge
-- Ref: advanced_ministry_elder_pastor.md §4, §5, §6, §9
--
-- Tables created:
--   elder_notes          — confidential elder observations
--   discernment_sessions — private elder workspace sessions
--   prayer_requests      — prayer wall entries (session or standalone)
--   prayer_acknowledgements — "I Prayed" audit trail
--   council_notes        — versioned Pastor Council Forge notes
--
-- Security requirements (§9):
--   - Elder and council data requires STRICTER RLS than
--     ordinary church-admin surfaces.
--   - Confidential notes must NEVER be visible to ChurchAdmin
--     unless explicitly authorised by church governance rules.
--   - Every access to elder or council spaces must be audit logged
--     via the existing audit_log_changes() trigger.
--   - AI consent must be captured before first use of AI
--     Wisdom features (consent_logs pattern from churchgoer_data.md).
--
-- RLS helper functions introduced here:
--   can_access_elder_data(church_id) — pastor_elder only
--   can_access_council_data(church_id) — pastor_elder + church_admin
-- ============================================================

-- ── Helper: elder-only access ────────────────────────────────
-- Used as the single access predicate for elder_notes,
-- discernment_sessions (content), and elder prayer walls.
-- Deliberately excludes church_admin to match §9 ("Confidential
-- notes must never be visible to ChurchAdmin unless explicitly
-- authorised by church governance rules.").
create or replace function public.can_access_elder_data(target_church uuid)
returns boolean
language sql
stable
as $$
  select
    public.is_platform_admin()
    or exists (
      select 1
      from public.church_memberships cm
      where cm.church_id  = target_church
        and cm.user_id    = auth.uid()
        and cm.is_active  = true
        and cm.role       = 'pastor'   -- app_role enum value for pastor/elder
    );
$$;

-- ── Helper: council access (pastor_elder + church_admin) ─────
-- Council notes are collaborative leadership documents visible
-- to both pastoral and administrative leadership.
create or replace function public.can_access_council_data(target_church uuid)
returns boolean
language sql
stable
as $$
  select
    public.is_platform_admin()
    or exists (
      select 1
      from public.church_memberships cm
      where cm.church_id  = target_church
        and cm.user_id    = auth.uid()
        and cm.is_active  = true
        and cm.role       in ('pastor', 'church_admin')
    );
$$;

-- ── 1. elder_notes ───────────────────────────────────────────
-- Confidential elder observations about members or situations.
-- is_confidential = true means only the author + other elders
-- in the same church can read the note.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.elder_notes (
  id              uuid        primary key default gen_random_uuid(),
  church_id       uuid        not null references public.churches(id) on delete cascade,
  profile_id      uuid        references public.profiles(id) on delete set null,  -- subject (optional)
  created_by      uuid        not null references public.profiles(id) on delete restrict,
  content         text        not null,
  is_confidential boolean     not null default true,
  created_at      timestamptz not null default timezone('utc', now()),
  updated_at      timestamptz not null default timezone('utc', now())
);

create index if not exists elder_notes_church_id_idx
  on public.elder_notes (church_id);

create index if not exists elder_notes_profile_id_idx
  on public.elder_notes (profile_id);

create index if not exists elder_notes_created_at_idx
  on public.elder_notes (created_at desc);

alter table public.elder_notes enable row level security;

create policy "elder_notes_select_elder_scope"
  on public.elder_notes for select
  to authenticated
  using (public.can_access_elder_data(church_id));

create policy "elder_notes_insert_elder_scope"
  on public.elder_notes for insert
  to authenticated
  with check (
    public.can_access_elder_data(church_id)
    and created_by = (
      select id from public.profiles
      where user_id = auth.uid()
      limit 1
    )
  );

-- Elders may only edit their own notes
create policy "elder_notes_update_own"
  on public.elder_notes for update
  to authenticated
  using (
    public.can_access_elder_data(church_id)
    and created_by = (
      select id from public.profiles
      where user_id = auth.uid()
      limit 1
    )
  )
  with check (
    public.can_access_elder_data(church_id)
    and created_by = (
      select id from public.profiles
      where user_id = auth.uid()
      limit 1
    )
  );

-- Audit trigger — every write recorded in audit_log
drop trigger if exists audit_elder_notes_changes on public.elder_notes;
create trigger audit_elder_notes_changes
  after insert or update or delete on public.elder_notes
  for each row execute function public.audit_log_changes();

-- ── 2. discernment_sessions ──────────────────────────────────
-- Private elder workspace sessions for deliberation and prayer.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.discernment_sessions (
  id          uuid        primary key default gen_random_uuid(),
  church_id   uuid        not null references public.churches(id) on delete cascade,
  title       text        not null,
  description text,
  date        timestamptz,
  status      text        not null default 'open'
    check (status in ('open', 'voting', 'closed', 'prayer')),
  outcome     text,
  created_by  uuid        references public.profiles(id) on delete set null,
  created_at  timestamptz not null default timezone('utc', now()),
  updated_at  timestamptz not null default timezone('utc', now())
);

create index if not exists discernment_sessions_church_id_status_idx
  on public.discernment_sessions (church_id, status);

create index if not exists discernment_sessions_date_idx
  on public.discernment_sessions (date desc);

alter table public.discernment_sessions enable row level security;

create policy "discernment_sessions_select_elder_scope"
  on public.discernment_sessions for select
  to authenticated
  using (public.can_access_elder_data(church_id));

create policy "discernment_sessions_manage_elder_scope"
  on public.discernment_sessions for all
  to authenticated
  using (public.can_access_elder_data(church_id))
  with check (public.can_access_elder_data(church_id));

-- Audit trigger
drop trigger if exists audit_discernment_sessions_changes on public.discernment_sessions;
create trigger audit_discernment_sessions_changes
  after insert or update or delete on public.discernment_sessions
  for each row execute function public.audit_log_changes();

-- ── 3. prayer_requests ───────────────────────────────────────
-- Prayer wall entries — linked to a discernment session or
-- standalone. anonymous requests hide requested_by in RLS-safe
-- manner (column is stored for audit; display logic in UI).
-- ─────────────────────────────────────────────────────────────
create table if not exists public.prayer_requests (
  id                      uuid        primary key default gen_random_uuid(),
  church_id               uuid        not null references public.churches(id) on delete cascade,
  discernment_session_id  uuid        references public.discernment_sessions(id) on delete cascade,
  requested_by            uuid        references public.profiles(id) on delete set null,
  title                   text        not null,
  description             text,
  is_anonymous            boolean     not null default false,
  prayed_count            int         not null default 0,
  created_at              timestamptz not null default timezone('utc', now()),
  updated_at              timestamptz not null default timezone('utc', now())
);

create index if not exists prayer_requests_church_id_idx
  on public.prayer_requests (church_id);

create index if not exists prayer_requests_session_id_idx
  on public.prayer_requests (discernment_session_id);

create index if not exists prayer_requests_created_at_idx
  on public.prayer_requests (created_at desc);

alter table public.prayer_requests enable row level security;

-- Elders see all prayer requests in their church
create policy "prayer_requests_select_elder_scope"
  on public.prayer_requests for select
  to authenticated
  using (public.can_access_elder_data(church_id));

-- Elders can create and manage prayer requests
create policy "prayer_requests_manage_elder_scope"
  on public.prayer_requests for all
  to authenticated
  using (public.can_access_elder_data(church_id))
  with check (public.can_access_elder_data(church_id));

-- Audit trigger
drop trigger if exists audit_prayer_requests_changes on public.prayer_requests;
create trigger audit_prayer_requests_changes
  after insert or update or delete on public.prayer_requests
  for each row execute function public.audit_log_changes();

-- ── 4. prayer_acknowledgements ───────────────────────────────
-- Immutable "I Prayed" records — one per profile per request.
-- Provides an audit trail without modifying the count in-place.
-- The prayed_count on prayer_requests is a denormalised cache
-- updated by the trigger below.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.prayer_acknowledgements (
  id                 uuid        primary key default gen_random_uuid(),
  church_id          uuid        not null references public.churches(id) on delete cascade,
  prayer_request_id  uuid        not null references public.prayer_requests(id) on delete cascade,
  profile_id         uuid        not null references public.profiles(id) on delete cascade,
  prayed_at          timestamptz not null default timezone('utc', now()),
  unique (prayer_request_id, profile_id)   -- one prayer per person per request
);

create index if not exists prayer_acks_request_id_idx
  on public.prayer_acknowledgements (prayer_request_id);

create index if not exists prayer_acks_profile_id_idx
  on public.prayer_acknowledgements (profile_id);

alter table public.prayer_acknowledgements enable row level security;

create policy "prayer_acks_select_elder_scope"
  on public.prayer_acknowledgements for select
  to authenticated
  using (public.can_access_elder_data(church_id));

create policy "prayer_acks_insert_own"
  on public.prayer_acknowledgements for insert
  to authenticated
  with check (
    public.can_access_elder_data(church_id)
    and profile_id = (
      select id from public.profiles
      where user_id = auth.uid()
      limit 1
    )
  );

-- Trigger: keep prayed_count in sync on prayer_requests
create or replace function public.sync_prayed_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    update public.prayer_requests
    set prayed_count = prayed_count + 1,
        updated_at   = timezone('utc', now())
    where id = NEW.prayer_request_id;
    return NEW;
  elsif TG_OP = 'DELETE' then
    update public.prayer_requests
    set prayed_count = greatest(prayed_count - 1, 0),
        updated_at   = timezone('utc', now())
    where id = OLD.prayer_request_id;
    return OLD;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_sync_prayed_count on public.prayer_acknowledgements;
create trigger trg_sync_prayed_count
  after insert or delete
  on public.prayer_acknowledgements
  for each row
  execute function public.sync_prayed_count();

-- ── 5. council_notes ─────────────────────────────────────────
-- Versioned Pastor Council Forge notes — collaborative
-- sermon outlines, series plans, council minutes.
-- Visible to pastor_elder + church_admin.
-- Field-level encryption is a Phase 5 item pending
-- pgsodium/Vault key management decision.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.council_notes (
  id           uuid        primary key default gen_random_uuid(),
  church_id    uuid        not null references public.churches(id) on delete cascade,
  title        text        not null,
  content      text,         -- rich text placeholder; Tiptap/Slate expansion in Phase 5
  note_type    text        not null default 'general'
    check (note_type in ('general', 'sermon_outline', 'series_plan', 'council_minutes', 'sabbath_reflection')),
  version      int         not null default 1,
  created_by   uuid        references public.profiles(id) on delete set null,
  last_edited_by uuid      references public.profiles(id) on delete set null,
  created_at   timestamptz not null default timezone('utc', now()),
  updated_at   timestamptz not null default timezone('utc', now())
);

create index if not exists council_notes_church_id_type_idx
  on public.council_notes (church_id, note_type);

create index if not exists council_notes_updated_at_idx
  on public.council_notes (updated_at desc);

alter table public.council_notes enable row level security;

create policy "council_notes_select_council_scope"
  on public.council_notes for select
  to authenticated
  using (public.can_access_council_data(church_id));

create policy "council_notes_manage_council_scope"
  on public.council_notes for all
  to authenticated
  using (public.can_access_council_data(church_id))
  with check (public.can_access_council_data(church_id));

-- Audit trigger — council notes are leadership documents
drop trigger if exists audit_council_notes_changes on public.council_notes;
create trigger audit_council_notes_changes
  after insert or update or delete on public.council_notes
  for each row execute function public.audit_log_changes();

-- Bump version on every update to council_notes
create or replace function public.bump_council_note_version()
returns trigger
language plpgsql
as $$
begin
  NEW.version := OLD.version + 1;
  NEW.updated_at := timezone('utc', now());
  return NEW;
end;
$$;

drop trigger if exists trg_bump_council_note_version on public.council_notes;
create trigger trg_bump_council_note_version
  before update on public.council_notes
  for each row
  when (OLD.content IS DISTINCT FROM NEW.content OR OLD.title IS DISTINCT FROM NEW.title)
  execute function public.bump_council_note_version();
