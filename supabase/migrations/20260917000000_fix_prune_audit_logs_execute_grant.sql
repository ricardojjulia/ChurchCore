-- Fix: public.prune_audit_logs is SECURITY DEFINER but never had its EXECUTE
-- privilege restricted, so PostgreSQL's default grant to PUBLIC left it
-- callable by anon/authenticated roles via the Supabase RPC endpoint --
-- letting any client erase the entire audit trail by calling
-- prune_audit_logs(0). The function is only ever invoked by
-- pruneAuditLogsAction (lib/actions/audit.ts) via the service-role client,
-- so no other role needs EXECUTE.
-- Flagged by automated PR review on PR #135 (Council Review 9 backlog).

REVOKE EXECUTE ON FUNCTION public.prune_audit_logs(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prune_audit_logs(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.prune_audit_logs(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.prune_audit_logs(integer) TO service_role;
