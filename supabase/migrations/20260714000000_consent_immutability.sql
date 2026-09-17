-- Security H-4 / ADR-0011: consent_logs — Database-level immutability trigger
-- Blocks all UPDATE and DELETE actions on consent_logs, enforcing an append-only audit ledger.

CREATE OR REPLACE FUNCTION public.prevent_consent_log_mutability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Modification or deletion of consent log entries is prohibited.';
END;
$$;

DROP TRIGGER IF EXISTS enforce_consent_log_immutability ON public.consent_logs;

CREATE TRIGGER enforce_consent_log_immutability
BEFORE UPDATE OR DELETE ON public.consent_logs
FOR EACH ROW
EXECUTE FUNCTION public.prevent_consent_log_mutability();
