-- WS-D4: Finance journals schema fixes for GL auto-posting from giving webhooks.
--
-- 1. Widen journal_type check to include 'giving' (used by autoPostToGl).
-- 2. Add voided_at and voided_by columns for GL reversal audit trail.

-- Drop the existing journal_type check constraint and replace it
alter table public.finance_journals
  drop constraint if exists finance_journals_journal_type_check;

alter table public.finance_journals
  add constraint finance_journals_journal_type_check
    check (journal_type in ('general', 'bank_feed', 'accounts_payable', 'import', 'giving'));

-- Add voided_at and voided_by audit columns
alter table public.finance_journals
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by text;
