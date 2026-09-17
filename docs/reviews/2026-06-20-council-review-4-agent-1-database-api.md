# Council Agent 1: Database & API Audit — ChurchCore Operations

**Date:** 2026-06-20  
**Auditor:** Agent 1 — Database & API State  
**Status:** Complete  

---

## 1. Migrations & Schema Inventory

The repository contains **80 database migrations** under `supabase/migrations/`.

- **CREATE TABLE statements audited**: All tables are properly configured.
- **RLS Status**: 100% of tenant schema tables containing a `church_id` column have Row Level Security (RLS) enabled. This is validated by `npm run audit:rls`.
- **Audit Log Pruning (ADR 0012)**: 
  - Added migration [20260714020000_audit_log_retention.sql](file:///Users/rjulia/ChurchCore/supabase/migrations/20260714020000_audit_log_retention.sql) defining the stored procedure `public.prune_audit_logs(retention_days)`.
  - Added standard `SECURITY DEFINER` and `search_path = public, pg_temp` constraints for robust application security.
- **Orphaned / Vestigial Tables**:
  - `ccm_badge_print_jobs` (schema exists but has no active TypeScript model definitions in active modules).
  - `localization_activation_history` (governance catalog history is tracked, but activation is currently fallback-driven).

---

## 2. Modules & Core Library

The key directory surfaces under `lib/` were audited:

- **`lib/actions/audit.ts`**: Exposes `pruneAuditLogsAction(retentionDays)` to run the database pruning RPC routine in addition to standard `logAuditEvent`.
- **`lib/actions/audit-pruning.test.ts`**: Unit test suite to verify arguments binding and connection error handling for the new pruning action.
- **`lib/pastor-portal-data.ts`**: Extracts unique target profile IDs from retrieved pastoral notes and logs read-auditing records in parallel. Verified with tests in `lib/pastor-portal-data.test.ts`.
- **`lib/supabase/tenant.ts`**: Provides dedicated tenant backend environment separation.

---

## 3. API Routes

We mapped all active files under `app/api/`:
- **`app/api/ai/route.ts`**: `POST` (calls AI client with rate-limiting context).
- **`app/api/unsubscribe/route.ts`**: `GET` (handles suppression lists). Rate limited to 15 requests per minute.
- **`app/api/push/subscribe/route.ts`**: `POST` (handles web push endpoint registration).

---

## 4. Seed Data

The seed script `scripts/seed-demo.mjs` and seed schema files populate realistic profiles, churches, giving records, and pastoral care assignments.

- **Missing/Gaps**: Seed data does not include expired session entries or mock audit logs for the new read-auditing features.

---

## 5. Critical Database/API Hardening Items for MVP

1. **Bulk Upload Rate Limiting**: The CSV import routes for member/financial data should have stricter transaction size limits and rate limiting to prevent memory depletion.
2. **Database Health Metrics API**: We need a read-only endpoint monitoring database connection pools and query queue depths.
3. **Session Expiry Synchronization**: Client-side timeout (15 mins) must be synchronized with Supabase JWT expiry parameters.
4. **Read Audit Log Coverage**: Add read-auditing to other highly sensitive sections, such as child check-in security logs.
