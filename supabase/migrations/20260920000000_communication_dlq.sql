-- ============================================================
-- Communication Dead-Letter Queue
-- Closes the gap flagged by Council Review 10: a communication_logs row
-- that exhausts its retry budget (retry_count reaches 3) simply stays at
-- status='failed' forever, indistinguishable from a row that failed once.
-- This table records permanent-failure exhaustion explicitly, scoped per
-- church, so it's visible and queryable instead of silently disappearing
-- into the noise of every other failed row.
-- ============================================================

create table if not exists public.communication_dlq (
  id                    uuid primary key default gen_random_uuid(),
  church_id             uuid not null references public.churches(id) on delete cascade,
  communication_log_id  uuid not null references public.communication_logs(id) on delete cascade,
  channel               text not null check (channel in ('email', 'sms', 'push', 'in_app')),
  recipient_id          uuid references public.profiles(id) on delete set null,
  attempted_count       integer not null check (attempted_count > 0),
  last_error_code       text,
  last_error_message    text,
  moved_to_dlq_at       timestamptz not null default timezone('utc', now()),
  created_at            timestamptz not null default timezone('utc', now())
);

-- One DLQ entry per communication_log row — re-exhausting an already-recorded
-- row (shouldn't happen since retry_count stops incrementing past 3, but kept
-- defensive) upserts in place rather than accumulating duplicates.
create unique index if not exists communication_dlq_log_id_unique
  on public.communication_dlq (communication_log_id);

create index if not exists communication_dlq_church_idx
  on public.communication_dlq (church_id, moved_to_dlq_at desc);

alter table public.communication_dlq enable row level security;

-- Same visibility as communication_logs/communication_templates: church_admin,
-- secretary, pastor, or platform_admin. No insert/update/delete policy for
-- `authenticated` — this table is written only by the retry cron via the
-- service-role admin client, never directly by a client-facing role.
drop policy if exists "communication_dlq_select_scope" on public.communication_dlq;
create policy "communication_dlq_select_scope"
  on public.communication_dlq for select
  to authenticated
  using (public.can_manage_communications(church_id));
