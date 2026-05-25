# Factory Run: Readiness Module-Owned Builders

**Date:** 2026-05-25  
**Factory surface:** Codex  
**Workflow:** `churchcore-feature-factory` with `churchcore-build-with-tests` implementation discipline  
**Roadmap phase:** Competitive Readiness Phase 1, Finish The Operator Path  
**Status:** Implemented and verified

## Intent

Continue executing the competitive-readiness roadmap by moving the weekly ChurchAdmin readiness path away from one centralized aggregate builder and toward module-owned readiness summaries.

This run targets the first safe split:

- Church setup readiness
- Portal account request readiness
- People and household readiness

## Story And Acceptance Criteria

As a ChurchAdmin evaluator, I want setup, account request, and people readiness rules to be owned by clear module builders, so the weekly readiness composer can scale without hiding module-specific logic in one aggregate file.

Acceptance criteria:

- Setup readiness emits the shared `ReadinessSummary` contract.
- Account request readiness emits the shared `ReadinessSummary` contract.
- People and household readiness emits the shared `ReadinessSummary` contract.
- `/app/church-admin/readiness` continues to receive the same ordered readiness items.
- Focused tests cover module builders and the composed readiness path.
- The roadmap, application docs, README, changelog, and factory tracker reflect the run.

## Technical Brief

- Add module-owned readiness builder functions for setup, account requests, and people/households.
- Reuse `ReadinessSummary` from `lib/readiness-contract.ts`.
- Move shared status, severity, and completion-state helpers into `lib/readiness-contract.ts`.
- Keep existing SQL and Supabase data loading unchanged for this slice.
- Keep UI behavior unchanged; this is a backend/data organization step.
- Preserve tenant isolation by keeping all church-scoped reads inside the existing readiness loader.
- No new dependencies.
- No schema changes.
- No provider integrations.

## Implementation Summary

Files changed:

- `lib/readiness-contract.ts`
- `lib/church-admin-readiness-modules.ts`
- `lib/church-admin-readiness-modules.test.ts`
- `lib/church-admin-readiness-data.ts`
- `lib/church-admin-readiness-data.test.ts`
- `README.md`
- `CHANGELOG.md`
- `docs/application-guide.md`
- `docs/mvp-readiness-audit.md`
- `docs/plans/competitive-readiness-roadmap.md`
- `docs/software-factory.md`
- `docs/factory-runs/README.md`
- `docs/factory-runs/2026-05-25-readiness-module-builders.md`

Patterns reused:

- Existing `lib/*-data.ts` style for tenant data helpers.
- Existing readiness item IDs and target routes.
- Existing Vitest style with focused unit coverage near changed behavior.
- Existing documentation rule to update README, changelog, and relevant docs.

## Verification

- `npm test -- lib/church-admin-readiness-data.test.ts lib/church-admin-readiness-modules.test.ts` - passed, 2 files and 6 tests.
- `npm run lint` - passed.
- `npm run build` - passed.
- `git diff --check` - passed before implementation commit.

## Residual Risk

- Events, children, volunteers, giving/finance, workflows, communications, and reports still need module-owned readiness builders.
- Communications and reports readiness summaries are not yet represented as first-class module-owned loaders.
- This run does not add route-level browser smoke coverage.

## Next Action

Split the remaining readiness domains into module-owned builders, starting with events and volunteer schedules because they are already represented in the weekly operator path and have filtered target views.

## Commit

- Implementation commit: `043db58 feat: split readiness module builders`
- Tracker finalization commit: pending.
