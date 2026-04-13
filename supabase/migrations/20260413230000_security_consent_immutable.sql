-- ============================================================
-- Security: consent_logs — make insert-only
-- Ref: docs/security-assessment.md (H-4)
-- Ref: docs/security-mitigation-plan.md (P2-A)
--
-- Consent records are legal evidence of what a person agreed
-- to and when. They must be append-only. A consent change is
-- a new INSERT row — never a mutation of an existing record.
-- ============================================================

-- Drop the policy that allows admins to update consent records
drop policy if exists "consent_logs_update_management_scope" on public.consent_logs;

-- Prevent future consent backdating: consented_at must be
-- within a 10-minute window of the insert time.
-- This closes the gap between form submission and DB write
-- while blocking retroactive consent fabrication.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'consent_logs_consented_at_not_backdated'
  ) then
    alter table public.consent_logs
      add constraint consent_logs_consented_at_not_backdated
      check (consented_at >= (now() - interval '10 minutes'));
  end if;
end $$;

-- Ensure consent_type is always recorded (belt + suspenders
-- beyond NOT NULL — explicit empty-string guard)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'consent_logs_consent_type_nonempty'
  ) then
    alter table public.consent_logs
      add constraint consent_logs_consent_type_nonempty
      check (length(trim(consent_type)) > 0);
  end if;
end $$;
