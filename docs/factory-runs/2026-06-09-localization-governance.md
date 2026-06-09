# Factory Run — Localization Governance Backend (CC-L10N-001)

**Date**: 2026-06-09  
**Branch**: `feat/cc-l10n-001-localization-governance`  
**Story**: CC-L10N-001  
**Agent**: Claude Sonnet 4.6  

---

## Intent

Implement the complete localization governance backend for ChurchCore, enabling churches to manage multilingual content through a structured lifecycle (translate → validate → review → approve → activate → rollback). The packages (`@localization-governance/*`) were vendored from ChurchCore Care, proved portable in a temp workspace, and committed to `vendor/localization-governance/` before this factory run.

---

## Files Created

| File | Purpose |
|------|---------|
| `supabase/migrations/20260712000000_localization_governance.sql` | Six governance tables with RLS, indexes, and custom audit trigger |
| `lib/localization-governance/pg-client.ts` | Singleton pg.Pool for LOCGOV_DATABASE_URL (server-only) |
| `lib/localization-governance/types.ts` | TypeScript types for the untyped JS packages |
| `lib/localization-governance/adapter.ts` | ChurchCore wrapper: storage + service + RBAC + reviewer assignments |
| `lib/localization-governance/runtime.ts` | Runtime catalog resolution with governance and hardcoded fallback |
| `lib/localization-governance/seed.ts` | Idempotent seed script: en source + es validated (not approved) |
| `app/app/church-admin/localization/actions.ts` | 12 server actions with RBAC, audit logging, and error normalization |
| `localization-governance.config.mjs` | CLI config for locgov binary |
| `.env.example` | Added LOCGOV_DATABASE_URL, LOCGOV_CHURCH_ID, LOCGOV_ACTOR_ID, GOOGLE_TRANSLATE_API_KEY |
| `docs/adr/0009-localization-governance.md` | Architecture decision record |
| `lib/localization-governance/adapter.test.ts` | Unit tests: RBAC gates, reviewer assignment, audit |
| `lib/localization-governance/runtime.test.ts` | Unit tests: catalog resolution logic |
| `lib/localization-governance/seed.test.ts` | Unit tests: idempotency, provenance, state |
| `lib/localization-governance/migration.test.ts` | Migration idempotency checks |
| `app/app/church-admin/localization/actions.test.ts` | Server action unit tests |
| `tests/locgov/lifecycle.e2e.test.ts` | Full lifecycle end-to-end test (filesystem storage) |
| `tests/locgov/consumer/index.test.mjs` | Consumer portability test (plain Node.js) |

---

## Architecture Impact

**New module boundary**: `lib/localization-governance/` is a server-only tree. The runtime module (`runtime.ts`) is the only file without `server-only` — it must be callable from RSC.

**Database**: Six new tables in the tenant Supabase project. All use `tenant_id` (FK to `churches.id`) for multi-tenancy. A custom audit trigger (`audit_locgov_changes()`) maps `tenant_id → church_id` for the audit log and excludes `messages`/`provenance` columns.

**RBAC**: Application-layer enforcement in `actions.ts` (read: any member, write: pastor+, admin ops: church_admin). RLS enforces data isolation at the database layer.

**Fallback chain**: If `LOCGOV_DATABASE_URL` is unset OR no active governance version exists, `getRuntimeCatalog()` returns the hardcoded `messages[locale]` from `lib/i18n.ts`. This preserves the existing runtime behavior exactly.

**No breaking changes**: `lib/i18n.ts` is unchanged. Existing imports, locale selection, and the hardcoded bilingual catalog all continue to work as before.

---

## Verification Commands

```bash
# Run the localization governance tests
npx vitest run lib/localization-governance/ app/app/church-admin/localization/

# Run lifecycle e2e (add tests/locgov to include list or run directly)
npx vitest run --reporter=verbose tests/locgov/lifecycle.e2e.test.ts

# Consumer portability test (plain Node.js)
node tests/locgov/consumer/index.test.mjs

# Lint
npm run lint

# Build
npm run build

# Full test suite
npm run test
```

---

## Residual Risks

1. **`LOCGOV_DATABASE_URL` requires Supabase transaction pooler URL** — not the session pooler. If the wrong URL is used, the pg.Pool will fail to connect. Mitigated: error message in `pg-client.ts` is clear.

2. **es catalog is `validated`, not `approved`** — churches using the governance system for the first time must run the es catalog through the review and activation lifecycle before it is served as the active catalog. Until then, the hardcoded i18n.ts catalog is used (no regression).

3. **Google Translate graceful degradation** — if `GOOGLE_TRANSLATE_API_KEY` is not set, the providers map is empty and the `translateVersion` service call will throw `provider_failure`. The server action catches this and returns a structured error. No crash.

4. **Reviewer assignment check in `submitReview`** — the assignment check reads from Supabase via the admin client. If the Supabase service role key is not configured, the check will fail. This is acceptable: `submitReview` requires admin infrastructure regardless.

5. **Migration audit trigger depends on `auth.uid()`** — in non-Supabase contexts (direct SQL, migrations) `auth.uid()` returns NULL. The audit log entry will have `actor_id = NULL`, which is the same behavior as existing triggers in the project.

---

## Follow-up Work

- [ ] Implement `locgov ci` in CI/CD pipeline to gate deployments on es being active and current.
- [ ] Build church-admin UI for the localization management page (`app/app/church-admin/localization/`).
- [ ] Add linguistic reviewer onboarding flow (assign reviewer, notify via communications module).
- [ ] Consider adding `stale` catalog warning to the weekly readiness check.
- [ ] After first real Spanish reviewer approves and activates es, update seed provenance docs.
- [ ] Evaluate adding more target locales (pt, fr, ko) as church demand grows.
