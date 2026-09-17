# Council Review 9 — Agent 1: Database & API Audit

**Date:** 2026-09-17 · **Branch:** feat/council-2-8-and-project-hq · **Read-only audit**

## Migrations

80 migrations, 95+ tables. RLS enabled broadly (113 `enable row level security` occurrences across 36 files). Tables are scoped by `church_id` with cascading FKs. Control plane uses separate `tenants`/`tenant_connections` tables gated to `platform_admin`. HQ governance tables (`hq_sessions`, `hq_tasks`, `hq_risks`, `hq_decisions`) are the newest addition.

## Lib & Server Utilities

179+ TypeScript files under `lib/`. `lib/supabase/` (control-plane/tenant client split), `lib/shepherd-ai/` (signal aggregation), `lib/communications/` (provider adapters, webhook signature verification), `lib/compliance/` (per-profile erasure request flow), `lib/finance-import.ts`, `lib/consent-log.ts` all have at least partial test coverage. Gap at audit time: `app/control/actions.ts` (erase/delete/update tenant) had zero tests.

## API Routes

15 `route.ts` files, all gated by session or webhook signature (`/api/control/*`, `/api/cron/*`, `/api/webhooks/*`, `/api/reports/custom`, `/api/push/subscribe`, `/api/unsubscribe`).

## App Pages

116 `page.tsx` files with role-based routing. Redirects found are intentional entry points, not stubs.

## Seed Data

Realistic demo: 1 church, 5 auth users across roles, 22 profiles, 8 families, 10 ministries. Idempotent (deterministic IDs, upsert). Missing: AI signal history, communications seed detail.

## Critical Finding: `app/control/actions.ts` tenant CRUD/erasure

At audit time, `updateTenantAction`/`deleteTenantAction`/`eraseTenantDataAction` (added after Council Review 8, no prior audit) had:

- **Incomplete erasure coverage**: `eraseTenantDataAction` deleted from only 5 tables (donations, volunteer_shifts, service_plans, events, profiles) against ~99 tables carrying `church_id` — missing families, attendance-adjacent tables, pastoral_notes, care_assignments, children's-ministry tables, finance tables, communications, onboarding, and more.
- **No audit trail**: none of the three actions logged to any audit table.
- **Silent failure**: `eraseTenantDataAction` always returned `{ ok: true }` regardless of whether either erasure attempt (local-fallback or Supabase) succeeded.
- **No transaction management**: local-DB and Supabase attempts ran as independent, individually-swallowed try/catch blocks.
- **Orphaned admin re-seed**: the re-created `System Admin` profile insert had no `user_id`, so it could never actually sign in.

**Recommendation at audit time:** block merge until hardened.

**Resolution:** see `docs/adr/0021-tenant-erasure-audit-hardening.md` and commit `268b915`. Erasure coverage expanded to 91 dependency-ordered tables; all three actions now write to the tenant `audit_log` via `logAuditEvent`; per-table failures are captured and returned (`{ ok, erasedTables, failedTables }`) instead of swallowed; the UI surfaces partial failures. Table coverage is deliberately flagged as "substantial, not schema-driven" — see the ADR's follow-up section. The `user_id`-less re-seed bug is pre-existing and now visible via `failedTables` rather than fixed outright.

## Top 5 Missing Pieces (audit-time)

1. Schema-driven (not hand-maintained) tenant erasure coverage, with real cross-table atomicity via a Postgres RPC — tracked as follow-up in ADR 0021.
2. Tests for control-plane actions — added in commit `268b915` (9 tests).
3. A tiered control-plane permission model (viewer/operator/admin) — today `canAccessControl` is a single flat `platform_admins` membership check; not a gap relative to the current role model, but worth an ADR if finer-grained tiers are wanted later.
4. RLS policy audit across all ~99 church_id tables against all 7 roles — not re-verified this round; recommend as a dedicated future council pass.
5. Fix the admin re-seed's missing `user_id` so the auto-created System Admin account can actually authenticate.
