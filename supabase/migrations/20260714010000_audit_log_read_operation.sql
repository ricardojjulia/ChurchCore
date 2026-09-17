-- Security H-5 / ADR-0011: audit_log — update operation check constraint to allow 'READ_PASTORAL'
-- Relax constraint to permit read-auditing operations in addition to write operations.

ALTER TABLE public.audit_log DROP CONSTRAINT IF EXISTS audit_log_operation_check;

ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_operation_check CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE', 'ERASE', 'READ_PASTORAL'));
