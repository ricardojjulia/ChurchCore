# ADR 0021 — Tenant Erasure & Control-Plane Audit Hardening

**Status:** Accepted
**Date:** 2026-09-17
**Authors:** Council Review 9 (Agent 1 finding), Documenter close-out

---

## Context

`app/control/actions.ts`'s `updateTenantAction`, `deleteTenantAction`, and `eraseTenantDataAction` were added after Council Review 8 and had never been through a council audit. Council Review 9's Agent 1 (database/API) flagged `eraseTenantDataAction` as critical: it deleted from only 5 of ~99 `church_id`-scoped tables, wrote no audit trail for any of the three actions, and always returned `{ ok: true }` even when every delete attempt failed. Agent 1 recommended blocking merge until hardened.

This is a destructive, compliance-relevant action (erasing a church's operational data is the closest thing this codebase has to a tenant-level right-to-erasure). A partial, silently-reported-as-successful erasure is worse than an honest failure — an operator who believes a tenant's data was erased, when 95% of it wasn't, has no reason to check.

## Decision

1. **Audit every control-plane tenant mutation.** `updateTenantAction`, `deleteTenantAction`, and `eraseTenantDataAction` now write to the tenant project's `audit_log` via the existing `logAuditEvent` helper, scoped by the target tenant's resolved `church_id`. The control-plane project has no generic audit table of its own (only `tenant_view_audit_logs`, scoped to view enter/exit) — reusing the tenant-side `audit_log` was chosen over adding a new control-plane table because it's an existing, tested, RLS-protected mechanism, and every control-plane mutation already has a resolvable target church. `deleteTenantAction` resolves and logs *before* deleting, since the tenant row is needed to resolve `church_id`.
2. **Never report success dishonestly.** `eraseTenantDataAction` now returns `{ ok, churchId, erasedTables, failedTables }` instead of an unconditional `{ ok: true }`. Each table delete is attempted independently and its result recorded; one table's failure doesn't abort the rest (deletes are idempotent, so a partial run is always safe to retry). `components/application/control-plane-dashboard.tsx` now reads this result and shows a distinct "Partially completed" state instead of always showing "Success".
3. **Expand table coverage substantially, but not claim completeness.** The erasure list grew from 5 to 91 tables, built from a scan of `supabase/migrations/*.sql` for `church_id`-scoped `create table` statements, ordered in dependency tiers (detail/child tables first, `profiles` last) so that any remaining ordering mistake surfaces as a loud per-table error rather than silent data loss. `consent_logs` is deliberately excluded (append-only by DB trigger, ADR 0011) and the audit tables themselves are excluded (the erasure event must remain auditable).
4. **Remove the dead local-fallback branch** in `eraseTenantDataAction` — it called `queryTenantLocalDb` unconditionally (not even gated by `shouldUseLocalTenantFallback()`), which has returned hardcoded `false` since commit `fb6674a` (2026-06-06, predating this branch). Not a behavior change; a cleanup consistent with the Supabase-only mandate ([[arch-supabase-only]] in memory).

## Consequences

- Destructive control-plane actions are now auditable and honest about partial failure — the two properties Agent 1 called critical.
- Table coverage (91/~99) is a large improvement but is **hand-maintained**, not schema-driven, so it will drift as new `church_id` tables are added. This is a known, accepted gap, not an oversight.
- The admin re-seed insert in `eraseTenantDataAction` still omits `user_id` (a pre-existing bug, not introduced by this ADR) — it now surfaces via `failedTables` instead of failing silently, but is not fixed here.

## Follow-up (not blocking, tracked for a future council round)

- Replace the hand-maintained table list with a Postgres RPC that derives church_id-scoped tables dynamically from `information_schema`, mirroring the existing `erase_profile_pii()` per-profile erasure pattern (`lib/actions/erasure.ts`). This would close the schema-drift gap and provide real cross-table atomicity, which sequential `.delete()` calls from the JS client cannot.
- Fix the admin re-seed to populate `user_id` so the auto-created System Admin profile can actually authenticate.
- Consider a tiered control-plane permission model (viewer/operator/admin) if finer-grained authorization is ever needed — today `canAccessControl` is a single flat `platform_admins` membership check, which is consistent with the rest of the role model but was flagged by Agent 1 as worth reconsidering.
