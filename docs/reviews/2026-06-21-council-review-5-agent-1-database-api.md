# Council Agent 1: Database & API Audit — ChurchCore Challenge

**Date:** 2026-06-21  
**Auditor:** Agent 1 — Database & API State  
**Status:** Complete  

---

## 1. Migrations & Schema Inventory

The repository contains **80 database migrations** under `supabase/migrations/`.

- **RLS Enforced**: 100% of tenant schema tables containing `church_id` have Row Level Security (RLS) enabled. Checked via `npm run audit:rls`.
- **Immutability Hardening**:
  - Implemented immutable DB triggers on `consent_logs` so once consent is written, it cannot be modified or deleted.
  - Implemented `public.prune_audit_logs(retention_days)` with `SECURITY DEFINER` and strict `search_path` to avoid search path hijacking.

### Challenging the Schema:
- **Impersonation Auditing Risk**: When a SuperAdmin impersonates a tenant, the session maps the user to a tenant context. While RLS prevents external leakage, the database audit triggers record the actor's profile ID. If a platform admin accesses sensitive care data, it must be recorded as an admin read rather than masked under a normal profile write.
- **Vestigial/Orphaned Tables**:
  - `ccm_badge_print_jobs` remains in the database schema without active frontend consumption.
  - `localization_activation_history` stores translation state transitions, but activation is currently fallback-driven in memory when local variables are active.

---

## 2. API Routes Audit

We analyzed all active routes under `app/api/`:
- **`/api/ai` (POST)**: AI proxy helper scrubbing sensitive UUIDs and emails. Gated by session checks.
- **`/api/unsubscribe` (GET)**: Handles suppression lists. Rate-limited to 15 req/min.
- **`/api/push/subscribe` (POST)**: Push subscription registration.
- **`/api/control/db-health` (GET)**: Exposes diagnostic data checking `pg_stat_activity` counts. Gated by `requireControlPlaneSession`.

### Challenging the API Strategy:
- **Connection Leak Potential**: `/api/control/db-health` connects using `queryTenantLocalDb` to check active connections. If the connection pool itself is fully exhausted, this endpoint will hang and timeout (returning a 500), rather than failing fast. We must implement a query timeout on this health check to prevent it from holding connection slots when the DB is saturated.
- **Rate-Limiting Isolation**: While `/api/unsubscribe` and `/api/push/subscribe` are rate-limited, other high-exposure route endpoints lack in-memory or redis-backed rate-limiting controls.

---

## 3. Top 3 Database & API Challenges

1. **Query Timeout on Diagnostics**: Ensure database query calls in `/api/control/db-health` abort within 2 seconds to avoid adding lock contention on an already-exhausted pool.
2. **Audit Attribution**: Hardcoded audit logs do not distinguish platform admin impersonation reads from regular tenant user reads. Audit entries must record the original `user_id` and the context flag `source: "impersonation"`.
3. **Control-Plane vs. Tenant Isolation Integrity**: While database clients are separate, the code shares local variables fallback configurations in dev. Ensure that dev scripts do not seed control plane data to tenant databases.
