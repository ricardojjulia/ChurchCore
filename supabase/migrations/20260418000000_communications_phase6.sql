-- ============================================================
-- Phase 6 — Communications & Polish
-- Adds: communication_type column on consent_logs,
--       communication_logs table (outbound channel audit),
--       notification_preferences table (per-member opt-in/out)
-- ============================================================

-- ── 1. Extend consent_logs with communication_type ──────────
-- preferred_contact_method already exists on profiles
-- (added in 20260411200000_churchgoer_data_extension.sql).
-- consent_logs gains an optional channel tag so consent records
-- can be narrowed to a specific communication type.

alter table public.consent_logs
  add column if not exists communication_type text
  check (
    communication_type is null
    or communication_type in ('email', 'sms', 'push', 'in_app')
  );

-- ── 2. notification_preferences ─────────────────────────────
-- Stores per-member, per-church opt-in preferences for each channel.
-- A missing row means the member has not explicitly set a preference
-- (application default: opted in for email, out for sms).

create table if not exists public.notification_preferences (
  id           uuid primary key default gen_random_uuid(),
  church_id    uuid not null references public.churches(id) on delete cascade,
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  email_opt_in boolean not null default true,
  sms_opt_in   boolean not null default false,
  push_opt_in  boolean not null default true,
  in_app_opt_in boolean not null default true,
  updated_at   timestamptz not null default timezone('utc', now()),
  constraint notification_preferences_church_profile_unique
    unique (church_id, profile_id)
);

create index if not exists notification_preferences_church_profile_idx
  on public.notification_preferences (church_id, profile_id);

alter table public.notification_preferences enable row level security;

-- Members can view and update their own preferences
create policy "notification_preferences_select_scope"
on public.notification_preferences
for select
to authenticated
using (
  profile_id = (
    select id from public.profiles where user_id = auth.uid() limit 1
  )
  or public.can_manage_church(church_id)
);

create policy "notification_preferences_insert_own"
on public.notification_preferences
for insert
to authenticated
with check (
  profile_id = (
    select id from public.profiles where user_id = auth.uid() limit 1
  )
  or public.can_manage_church(church_id)
);

create policy "notification_preferences_update_own"
on public.notification_preferences
for update
to authenticated
using (
  profile_id = (
    select id from public.profiles where user_id = auth.uid() limit 1
  )
  or public.can_manage_church(church_id)
)
with check (
  profile_id = (
    select id from public.profiles where user_id = auth.uid() limit 1
  )
  or public.can_manage_church(church_id)
);

-- ── 3. communication_logs ─────────────────────────────────────
-- Immutable audit trail of every outbound message attempted.
-- Rows are inserted by server actions; never updated in-place.
-- status transitions are appended as new rows (idempotent audit).

create table if not exists public.communication_logs (
  id             uuid primary key default gen_random_uuid(),
  church_id      uuid not null references public.churches(id) on delete cascade,
  -- sender: the profile that triggered the send (pastor, admin, or null for system)
  sent_by        uuid references public.profiles(id) on delete set null,
  -- recipient: null means broadcast (resolve list at send time, log per-recipient in app layer)
  recipient_id   uuid references public.profiles(id) on delete set null,
  channel        text not null
    check (channel in ('email', 'sms', 'push', 'in_app')),
  subject        text,
  body_preview   text,            -- first 500 chars, never full body (privacy)
  external_id    text,            -- SendGrid message-id / Twilio SID
  status         text not null default 'queued'
    check (status in ('queued', 'sent', 'delivered', 'failed', 'bounced')),
  error_message  text,
  scheduled_for  timestamptz,
  sent_at        timestamptz,
  created_at     timestamptz not null default timezone('utc', now())
);

create index if not exists communication_logs_church_id_idx
  on public.communication_logs (church_id, created_at desc);

create index if not exists communication_logs_recipient_idx
  on public.communication_logs (recipient_id, created_at desc);

create index if not exists communication_logs_external_id_idx
  on public.communication_logs (external_id)
  where external_id is not null;

alter table public.communication_logs enable row level security;

-- Pastors and admins can view logs for their church
create policy "communication_logs_select_management"
on public.communication_logs
for select
to authenticated
using (public.can_manage_church(church_id));

-- Members can view logs addressed to them
create policy "communication_logs_select_own"
on public.communication_logs
for select
to authenticated
using (
  recipient_id = (
    select id from public.profiles where user_id = auth.uid() limit 1
  )
);

-- Only management can insert (server actions use service role or admin client)
create policy "communication_logs_insert_management"
on public.communication_logs
for insert
to authenticated
with check (public.can_manage_church(church_id));

-- No updates or deletes — append-only audit table
-- (updates to status are new rows or done via service-role in background jobs)

-- ── 4. Audit triggers ─────────────────────────────────────────
-- communication_logs is append-only; notification_preferences
-- carries PII so we attach the shared audit trigger.
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'audit_notification_preferences'
      and tgrelid = 'public.notification_preferences'::regclass
  ) then
    create trigger audit_notification_preferences
    after insert or update or delete on public.notification_preferences
    for each row execute function public.audit_log_changes();
  end if;
end $$;
