# ADR 0009 — Localization Governance (CC-L10N-001)

**Status**: Accepted  
**Date**: 2026-06-09  
**Story**: CC-L10N-001  
**Authors**: Engineering

---

## Context

ChurchCore ships a hardcoded bilingual catalog in `lib/i18n.ts` (English and Spanish). As the platform expands to serve more language communities, individual churches need the ability to:

- Create and manage translation versions per locale.
- Run translations through a governance lifecycle (translate → validate → review → approve → activate).
- Roll back to previously-activated versions if a problem is discovered.
- Enforce CI/CD policy gates that require at minimum Spanish to be active and current.

The ChurchCore Care product developed a reusable governance library (`@localization-governance/*`) that is already tested and production-ready. Porting it as a vendored tarball is lower-risk than reimplementing from scratch.

---

## Decision 1 — Vendor tarballs from ChurchCore Care

**Chosen**: Pack 5 tarballs from ChurchCore Care's `localization-governance` monorepo and commit them to `vendor/localization-governance/`. Install via `file:` protocol in `package.json`.

**Alternatives considered**:
- Publish to a private npm registry — requires registry infrastructure and secrets management overhead.
- Copy source files directly — breaks the package module boundary, makes future upgrades harder.
- Reimplement from scratch — high risk, no benefit over proven code.

**Rationale**: The tarball approach is battle-tested in ChurchCore Care. It gives us a clean package boundary, a reproducible install, and a clear upgrade path (unpack new tarball, bump version in package.json).

---

## Decision 2 — Use `createPostgresStorage`, not filesystem storage

**Chosen**: `@localization-governance/storage-postgres` backed by `LOCGOV_DATABASE_URL`.

**Alternatives considered**:
- Filesystem storage (`@localization-governance/storage-filesystem`) — suitable for CLI and testing only; not safe for concurrent server requests.
- Supabase JS client — does not expose a raw `.query(sql, params)` method; the postgres adapter requires direct pg access.

**Rationale**: The postgres adapter is the only option that supports transactions (required by `activateVersion` and `rollbackLocale`), connection pooling, and concurrent safety.

---

## Decision 3 — Why `LOCGOV_DATABASE_URL` instead of the Supabase JS client

The `createPostgresStorage` adapter requires a `client.query(sql, params)` method (pg `Pool` or `PoolClient` interface). The Supabase JS client does not expose this — it only exposes a PostgREST query builder. Adding direct postgres access requires a raw `pg.Pool` pointed at the Supabase transaction pooler URL.

`LOCGOV_DATABASE_URL` points to the Supabase transaction pooler (port 6543) for the tenant project. This is the same database as `TENANT_SUPABASE_URL` but accessed via raw SQL rather than the PostgREST API. Security classification: server-only, same tier as `SUPABASE_SERVICE_ROLE_KEY`. Never prefix with `NEXT_PUBLIC_`.

A singleton pool is constructed in `lib/localization-governance/pg-client.ts` (marked `server-only`).

---

## Decision 4 — `tenant_id` column, custom audit trigger

**Chosen**: All six governance tables use `tenant_id uuid NOT NULL REFERENCES public.churches(id)` as the tenancy column. This is what the `createPostgresStorage` adapter expects (`tenantId` constructor argument, `tenant_id` SQL column).

**Impact**: The standard ChurchCore audit trigger (`audit_log_changes()`) reads from a `church_id` column. These tables use `tenant_id` instead. A custom trigger function `audit_locgov_changes()` is defined in the migration that maps `tenant_id → church_id` in the audit record.

**Security**: The trigger excludes `messages` and `provenance` columns from `new_values`/`old_values` in the audit log. These columns contain catalog text (potentially large, free-form strings) that must not be stored in the audit log per the data minimization policy.

---

## Decision 5 — Hardcoded `es` catalog seeded as `validated`, not `approved`

**Chosen**: The seed script (`lib/localization-governance/seed.ts`) creates the Spanish catalog version in `validated` state with provenance `{ source: 'hardcoded_i18n_migration', approvedByHuman: false }`.

**Rationale**: The existing Spanish translation in `lib/i18n.ts` was written by engineering, not reviewed by a human linguist. Entering it as `approved` or `active` would incorrectly imply it passed the governance review process. The `validated` state preserves the translation as usable (it will be picked up as active once a church admin completes the review lifecycle) while the provenance record makes the migration origin explicit and auditable.

**Impact on existing behavior**: Runtime behavior is unchanged. The `getRuntimeCatalog()` function in `lib/localization-governance/runtime.ts` falls back to the hardcoded `messages[locale]` catalog when no active governance version exists (i.e., before the es version is approved and activated).

---

## Decision 6 — RLS strategy

All six tables use the existing `belongs_to_church(tenant_id)` and `can_manage_church(tenant_id)` helper functions:

- `SELECT`: `belongs_to_church(tenant_id)` — any authenticated church member can read governance records.
- `INSERT`, `UPDATE`, `DELETE`: `can_manage_church(tenant_id)` — church admin and platform admins only.

Application-layer RBAC in `app/app/church-admin/localization/actions.ts` adds finer-grained control (e.g., `pastor` can write, only `church_admin` can activate/rollback).

---

## Consequences

- `lib/localization-governance/` is a server-only module tree.
- `lib/localization-governance/runtime.ts` is intentionally NOT marked `server-only` — it must be importable from RSC context.
- The `localization-governance.config.mjs` file enables CLI operations (`locgov` binary from `@localization-governance/cli`).
- `lib/i18n.ts` is NOT modified. Existing behavior is fully preserved as fallback.
- Future upgrade path: unpack new tarballs to `vendor/localization-governance/`, bump `file:` version in `package.json`, run `npm install`.
