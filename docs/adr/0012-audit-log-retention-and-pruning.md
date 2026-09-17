# ADR 0012: Audit Log Retention Policy and Pruning Schedule

* **Status:** Accepted
* **Date:** 2026-06-20
* **Authors:** Antigravity (Gemini Software Factory)
* **Decisions:** [2026-06-20-council-review-3-synthesis.md](file:///Users/rjulia/ChurchCore/docs/reviews/2026-06-20-council-review-3-synthesis.md)

---

## Context and Problem Statement

Following the integration of read-auditing for pastoral care records (ADR 0011), the `public.audit_log` table will experience rapid growth. Every query retrieving pastoral notes records a `'READ_PASTORAL'` transaction. 

Under GDPR and generic data minimization guidelines, data controllers must not retain logs containing sensitive PII (such as actor IDs, role mappings, and target record IDs) indefinitely unless strictly necessary. Retaining infinite histories increases compliance liability and presents risks of database storage exhaustion on tenant instances.

---

## Decision Drivers

* **Data Minimization (GDPR Article 5)**: Personal data must be kept in a form which permits identification of data subjects for no longer than is necessary.
* **Storage Optimization**: Prevent uncontrolled database bloat from high-volume read transactions.
* **Regulatory Auditing Windows**: Most church administrative audits do not require access logs older than 1 year (365 days).

---

## Proposed Decisions

### 1. Configurable Retention Window
Introduce a standardized retention window defaulting to **365 days** (1 year). 

### 2. Database-Level Pruning Function
Implement a secure, optimized database function `public.prune_audit_logs(retention_days integer)` that deletes all entries from `public.audit_log` created before the threshold:
```sql
DELETE FROM public.audit_log
WHERE created_at < now() - (retention_days || ' days')::interval;
```

### 3. Automated Cron Execution
In production environments, the pruning procedure will execute via Supabase `pg_cron` scheduling:
```sql
SELECT cron.schedule('prune-expired-audit-logs', '0 3 * * *', 'SELECT public.prune_audit_logs(365)');
```

---

## Consequences

* **Positive**:
  - Enforces automatic GDPR data minimization constraints.
  - Mitigates long-term storage exhaustion risks.
  - Keeps query indexes on the `audit_log` table clean and high-performing.
* **Negative**:
  - Historical access records older than 365 days are permanently destroyed. Legal or administrative reviews requiring older records must set up dedicated off-site compliance backups.
