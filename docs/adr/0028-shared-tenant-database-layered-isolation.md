# ADR 0028: Shared tenant database with layered isolation

- Status: Accepted
- Date: 2026-10-07
- Deciders: Ricardo Julia
- Refines: ADR 0002 (the control-plane / tenant split is unchanged)
- Supersedes: the "one Supabase project per church" recommendation in `docs/cloud-architecture.md` (2026-04-17)

## Context

Our documents described tenancy in two incompatible ways:

- **One shared database.** `docs/tenant-data-segmentation.md` (2026-09-18) describes what is built: every church shares one tenant database and is isolated by `church_id` and PostgreSQL row-level security. Production runs this way. The hosted ChurchCore Ops project holds every church.
- **A database per church.** `docs/cloud-architecture.md` recommended one Supabase project per church. Sales-facing docs (`docs/mvp-competitive-analysis.md`, `docs/product-strategy.md` and `docs/buyer/security-privacy-story.md`) described "a completely separate database" per church, and called cross-tenant exposure "architecturally impossible".

The second description overstated what is built, and a church IT reviewer would find the gap.

ADR 0002 allows either model for the tenant plane. The control-plane database is separate from tenant data in both, and that does not change.

The owner chose the shared-database model, with increased separation layered on top of it (2026-10-07).

## Decision

ChurchCore's canonical tenancy model is **one shared tenant database, isolated by layers**:

1. **Control plane apart.** Platform data (the tenant registry, staff sign-in, demo feedback and the "view as" audit) lives in a separate Supabase project, per ADR 0002. Tenant data never sits beside it.
2. **`church_id` on every church table, enforced by RLS in the database engine.**
   - Every policy composes from `is_platform_admin()`, `belongs_to_church()` and `can_manage_church()`, and each of those reads `auth.uid()` from the signed JWT.
   - A church user's session can't read or write another church's rows: the database refuses the query.
   - `npm run audit:rls` blocks CI when a `church_id` table lacks RLS.
3. **Least-privilege writes.**
   - Members and staff get the narrowest policies their pages need. Some tables are read-only to `authenticated` (communications, for example).
   - Writes the policies don't allow go through a church-scoped admin client, with an explicit `church_id` on every query, after the caller's session and role are checked in code (ADR 0022). An action that takes a trusted church or session argument is `server-only`, never `"use server"`.
4. **Privileged functions take their actor from `auth.uid()`**, never from an argument (ADR 0024). `EXECUTE` is granted narrowly.
5. **Field encryption for the most sensitive data.** Pastoral notes, care-assignment summaries and elder-council documents are encrypted at rest with AES-256-GCM, using an application key the database never sees (`lib/crypto/pastoral.ts`).
6. **Platform staff separation.** "Platform admin" is an explicit allow-list (`platform_admins`). No church role grants platform access. Staff "view as" sessions are audited in the control plane.
7. **Per-church data operations.** Tenant erasure and audit (ADR 0021), per-church exports, and audited deletes all work by `church_id`.

A dedicated database for one church is **not built and not planned for the MVP**. ADR 0002 still allows it later, for example for a data-residency or enterprise requirement, and the control plane's `tenant_connections` keeps the hook. It would be a new decision with its own ADR.

## Consequences

- **Docs.** Product, buyer and architecture docs describe the shared model accurately. Nothing may claim per-church databases or "architecturally impossible" exposure. The accurate claim: isolation is enforced by the database for every church table, and backed by the layers above.
- **One project to run.** There is one tenant database to operate, migrate and back up. Migrations apply once (the O-row pattern), and costs don't scale per church.
- **What to guard.** A defect in a policy or in a server action's scoping is the main cross-tenant risk. That is why RLS is audited in CI, why every surface ships its role and tenant tests (`tests/coverage-manifest.json`, e2e every page × role), and why the Council has a dedicated Security seat.
- **Data residency.** Every church's data lives in the tenant project's region. A church needing another region would trigger the dedicated-database option above.
