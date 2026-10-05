-- G3.3b: ChurchCore's own receipt for a paid event registration.
--
-- The Stripe webhook claims the receipt (receipt_claimed_at, a 5-minute
-- lease) before it emails the registrant, and writes receipt_sent_at only
-- once the email provider accepts it, so a webhook retry, a duplicate event or
-- two concurrent deliveries never send a second receipt. Same pattern as
-- donations.receipt_claimed_at / receipt_sent_at.
-- Additive and idempotent; both columns are nullable, no backfill (past
-- payments simply have no receipt recorded and are never re-sent).
-- Rollback: alter table public.event_registration_payments
--   drop column if exists receipt_claimed_at, drop column if exists receipt_sent_at;
-- (the receipt path then loses its duplicate guard; no other data changes).

alter table public.event_registration_payments
  add column if not exists receipt_claimed_at timestamptz,
  add column if not exists receipt_sent_at timestamptz;

comment on column public.event_registration_payments.receipt_claimed_at is
  'G3.3b: lease taken just before the receipt email is sent; a claim older than 5 minutes may be taken over.';
comment on column public.event_registration_payments.receipt_sent_at is
  'G3.3b: set once the email provider accepted the registration receipt.';
