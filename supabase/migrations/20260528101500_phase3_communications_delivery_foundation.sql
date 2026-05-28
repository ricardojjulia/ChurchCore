-- ============================================================
-- Phase 3 — Communications Delivery Foundation
-- Adds delivery event audit + suppression controls + retry metadata.
-- ============================================================

-- ── 1. Extend communication_logs for delivery lifecycle ─────
alter table public.communication_logs
  add column if not exists provider text
  check (provider is null or provider in ('sendgrid', 'twilio', 'resend'));

alter table public.communication_logs
  add column if not exists provider_message_id text;

alter table public.communication_logs
  add column if not exists retry_count integer not null default 0
  check (retry_count >= 0);

alter table public.communication_logs
  add column if not exists last_retry_at timestamptz;

alter table public.communication_logs
  add column if not exists suppression_reason text
  check (
    suppression_reason is null
    or suppression_reason in ('manual', 'unsubscribe', 'bounce', 'complaint')
  );

alter table public.communication_logs
  add column if not exists suppressed_at timestamptz;

alter table public.communication_logs
  add column if not exists delivered_at timestamptz;

alter table public.communication_logs
  add column if not exists failed_at timestamptz;

alter table public.communication_logs
  add column if not exists error_code text;

alter table public.communication_logs
  drop constraint if exists communication_logs_status_check;

alter table public.communication_logs
  add constraint communication_logs_status_check
  check (
    status in (
      'draft',
      'queued',
      'scheduled',
      'sending',
      'sent',
      'delivered',
      'failed',
      'bounced',
      'suppressed',
      'unsubscribed',
      'cancelled'
    )
  );

create index if not exists communication_logs_status_idx
  on public.communication_logs (church_id, status, created_at desc);

create index if not exists communication_logs_provider_message_idx
  on public.communication_logs (provider_message_id)
  where provider_message_id is not null;

-- ── 2. communication_delivery_events ─────────────────────────
create table if not exists public.communication_delivery_events (
  id                  uuid primary key default gen_random_uuid(),
  church_id           uuid not null references public.churches(id) on delete cascade,
  communication_log_id uuid references public.communication_logs(id) on delete set null,
  provider            text not null check (provider in ('sendgrid', 'twilio', 'resend')),
  channel             text not null check (channel in ('email', 'sms')),
  event_type          text not null,
  status              text not null check (
    status in (
      'sending',
      'sent',
      'delivered',
      'failed',
      'bounced',
      'suppressed',
      'unsubscribed',
      'cancelled'
    )
  ),
  provider_event_id   text,
  provider_message_id text,
  recipient_contact   text,
  reason              text,
  idempotency_key     text not null,
  raw_payload         jsonb,
  occurred_at         timestamptz not null,
  created_at          timestamptz not null default timezone('utc', now()),
  constraint communication_delivery_events_idempotency_key_unique
    unique (idempotency_key)
);

create index if not exists communication_delivery_events_church_idx
  on public.communication_delivery_events (church_id, occurred_at desc);

create index if not exists communication_delivery_events_log_idx
  on public.communication_delivery_events (communication_log_id, occurred_at desc);

create index if not exists communication_delivery_events_provider_msg_idx
  on public.communication_delivery_events (provider_message_id)
  where provider_message_id is not null;

alter table public.communication_delivery_events enable row level security;

create policy "communication_delivery_events_select_management"
on public.communication_delivery_events
for select
to authenticated
using (public.can_manage_church(church_id));

create policy "communication_delivery_events_insert_management"
on public.communication_delivery_events
for insert
to authenticated
with check (public.can_manage_church(church_id));

-- ── 3. communication_suppressions ────────────────────────────
create table if not exists public.communication_suppressions (
  id              uuid primary key default gen_random_uuid(),
  church_id       uuid not null references public.churches(id) on delete cascade,
  channel         text not null check (channel in ('email', 'sms')),
  contact         text not null,
  reason          text not null check (reason in ('manual', 'unsubscribe', 'bounce', 'complaint')),
  notes           text,
  suppressed_by   uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default timezone('utc', now()),
  constraint communication_suppressions_unique unique (church_id, channel, contact)
);

create index if not exists communication_suppressions_church_idx
  on public.communication_suppressions (church_id, channel, created_at desc);

alter table public.communication_suppressions enable row level security;

create policy "communication_suppressions_select_management"
on public.communication_suppressions
for select
to authenticated
using (public.can_manage_church(church_id));

create policy "communication_suppressions_insert_management"
on public.communication_suppressions
for insert
to authenticated
with check (public.can_manage_church(church_id));

-- ── 4. Audit triggers ────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'audit_communication_suppressions'
      and tgrelid = 'public.communication_suppressions'::regclass
  ) then
    create trigger audit_communication_suppressions
    after insert or update or delete on public.communication_suppressions
    for each row execute function public.audit_log_changes();
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'audit_communication_delivery_events'
      and tgrelid = 'public.communication_delivery_events'::regclass
  ) then
    create trigger audit_communication_delivery_events
    after insert or update or delete on public.communication_delivery_events
    for each row execute function public.audit_log_changes();
  end if;
end $$;
