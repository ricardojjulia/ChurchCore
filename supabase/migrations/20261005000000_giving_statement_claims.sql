-- G3.3: year-end giving statements, claim-before-send idempotency.
--
-- A statement send inserts a communication_logs row (status 'sending') carrying
-- segment_criteria->>'statementKey' BEFORE the provider is called. This partial
-- unique index makes that insert the lock: a second run, a double click or a
-- concurrent batch for the same donor and range hits a unique violation and is
-- skipped as already sent. Rows that failed, were suppressed or were opted out
-- are outside the index, so a re-run can claim them again. All five values are
-- allowed by communication_logs_status_check (20260528101500).
-- Additive and idempotent; no existing row has a statementKey.
-- Rollback: drop index if exists public.communication_logs_statement_claim_uidx;
-- (the send path then loses its duplicate guard; no data changes).

create unique index if not exists communication_logs_statement_claim_uidx
  on public.communication_logs (church_id, (segment_criteria->>'statementKey'))
  where segment_criteria ? 'statementKey'
    and status in ('sending', 'queued', 'sent', 'delivered');

comment on index public.communication_logs_statement_claim_uidx is
  'G3.3: one claimed-or-sent giving statement per church, donor and date range.';
