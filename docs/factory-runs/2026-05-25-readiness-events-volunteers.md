# Factory Run: Readiness Events And Volunteers

**Date:** 2026-05-25  
**Factory surface:** Codex  
**Workflow:** `churchcore-feature-factory` with `churchcore-build-with-tests` implementation discipline  
**Roadmap phase:** Competitive Readiness Phase 1, Finish The Operator Path  
**Status:** Verification passed, pull request pending

## Intent

Continue the module-owned readiness split by moving weekend event and volunteer schedule summary construction out of the central ChurchAdmin readiness composer.

## Story And Acceptance Criteria

As a ChurchAdmin evaluator, I want weekend event and volunteer readiness rules to be owned by clear module builders, so the weekly readiness composer stays focused on composition and the module rules can be tested independently.

Acceptance criteria:

- Weekend event readiness emits the shared `ReadinessSummary` contract.
- Volunteer schedule readiness emits the shared `ReadinessSummary` contract.
- `/app/church-admin/readiness` keeps the same ordered readiness items and target routes.
- Focused tests cover missing-event, roster-gap, and volunteer coverage cases.
- Roadmap, application guide, MVP audit, changelog, and tracker reflect the run.
- Delivery uses branch and pull request workflow.

## Technical Brief

- Add event and volunteer builder functions to `lib/church-admin-readiness-modules.ts`.
- Keep current SQL and Supabase reads unchanged.
- Keep current UI rendering unchanged.
- Preserve target routes:
  - `/app/church-admin/events?view=needs-roster`
  - `/app/church-admin/volunteers/schedules?view=unassigned`
- No schema changes.
- No new dependencies.
- No role-access changes.

## Implementation Summary

Files changed:

- `lib/church-admin-readiness-modules.ts`
- `lib/church-admin-readiness-modules.test.ts`
- `lib/church-admin-readiness-data.ts`
- `CHANGELOG.md`
- `docs/application-guide.md`
- `docs/mvp-readiness-audit.md`
- `docs/plans/competitive-readiness-roadmap.md`
- `docs/factory-runs/README.md`
- `docs/factory-runs/2026-05-25-readiness-events-volunteers.md`

Patterns reused:

- Existing `ReadinessSummary` contract.
- Existing builder style from setup, accounts, and people readiness.
- Existing Vitest focused unit-test style.
- Existing factory-run tracking format.

## Verification

- `npm test -- lib/church-admin-readiness-data.test.ts lib/church-admin-readiness-modules.test.ts` - passed, 2 files and 8 tests.
- `npm run lint` - passed.
- `npm run build` - passed.
- `git diff --check` - passed.

## Residual Risk

- Children's ministry, giving/finance, and suggested workflows still need module-owned builders.
- Communications and reports still need first-class readiness summaries.
- This run does not add browser smoke coverage.

## Delivery

- Branch: `feature/readiness-events-volunteers`
- Pull request: pending
- Merge: pending
