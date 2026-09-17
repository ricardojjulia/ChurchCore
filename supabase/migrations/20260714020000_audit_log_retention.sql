-- ADR 0012: Audit Log Retention Policy and Pruning Schedule
-- Creates the public.prune_audit_logs(retention_days integer) function to remove old entries from public.audit_log

CREATE OR REPLACE FUNCTION public.prune_audit_logs(retention_days integer = 365)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.audit_log
  WHERE created_at < now() - (retention_days || ' days')::interval;
END;
$$;
