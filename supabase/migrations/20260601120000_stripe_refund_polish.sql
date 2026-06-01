-- 1. Add 'partially_refunded' to event_registrations.payment_status
alter table public.event_registrations
  drop constraint if exists event_registrations_payment_status_check;
alter table public.event_registrations
  add constraint event_registrations_payment_status_check
  check (payment_status in (
    'not_required', 'pending', 'paid', 'failed',
    'refunded', 'partially_refunded'
  ));

-- 2. Add 'partially_refunded' to event_registration_payments.status
alter table public.event_registration_payments
  drop constraint if exists event_registration_payments_status_check;
alter table public.event_registration_payments
  add constraint event_registration_payments_status_check
  check (status in (
    'pending', 'succeeded', 'failed', 'refunded',
    'cancelled', 'partially_refunded'
  ));

-- 3. Refund tracking columns
alter table public.event_registration_payments
  add column if not exists refund_amount_cents   int,
  add column if not exists refund_id             text,
  add column if not exists refund_reason         text,
  add column if not exists refund_requested_at   timestamptz,
  add column if not exists refund_completed_at   timestamptz;

-- 4. Index for idempotency lookups
create index if not exists event_registration_payments_refund_id_idx
  on public.event_registration_payments (refund_id)
  where refund_id is not null;

-- 5. Unique constraint on refund_id (DB-layer guard against concurrent double-writes)
-- The sparse index above is superseded by the unique index that the constraint creates.
-- Drop it first to avoid a redundant duplicate index on the same column subset.
drop index if exists public.event_registration_payments_refund_id_idx;

alter table public.event_registration_payments
  add constraint event_registration_payments_refund_id_unique
  unique (refund_id);
