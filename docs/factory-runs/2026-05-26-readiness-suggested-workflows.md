# Factory Run: Readiness Suggested Workflows

**Date:** 2026-05-26  
**Factory surface:** Codex  
**Workflow:** `churchcore-feature-factory` with `churchcore-build-with-tests` implementation discipline  
**Roadmap phase:** Competitive Readiness Phase 1, Finish The Operator Path  
**Status:** Verification passed, pull request pending

## Intent

Continue the module-owned readiness split by moving suggested workflow readiness summary construction out of the central ChurchAdmin readiness composer.

## Story And Acceptance Criteria

As a ChurchAdmin evaluator, I want suggested workflow readiness rules to be owned by a clear module builder, so workflow backlog triage can be tested independently from the weekly readiness composer.

Acceptance criteria:

- Suggested workflow readiness emits the shared `ReadinessSummary` contract.
- `/app/church-admin/readiness` keeps the same ordered readiness items and target route.
- Focused tests cover ready, triage-needed, and blocked backlog states.
- Roadmap, application guide, MVP audit, changelog, README, and tracker reflect the run.
- Delivery uses branch and pull request workflow.

## Technical Brief

- Add a suggested workflow builder function to `lib/church-admin-readiness-modules.ts`.
- Keep current SQL and Supabase reads unchanged.
- Keep current UI rendering unchanged.
- Preserve target route: `/app/church-admin/workflows?status=open`.
- No schema changes.
- No new dependencies.
- No role-access changes.

## Implementation Summary

Files changed:

- `lib/church-admin-readiness-modules.ts`
- `lib/church-admin-readiness-modules.test.ts`
- `lib/church-admin-readiness-data.ts`
- `README.md`
- `CHANGELOG.md`
- `docs/application-guide.md`
- `docs/mvp-readiness-audit.md`
- `docs/plans/competitive-readiness-roadmap.md`
- `docs/factory-runs/README.md`
- `docs/factory-runs/2026-05-26-readiness-suggested-workflows.md`

Patterns reused:

- Existing `ReadinessSummary` contract.
- Existing builder style from setup, accounts, people, events, children, volunteers, and money readiness.
- Existing Vitest focused unit-test style.
- Existing factory-run tracking format.

## Verification

- `npm test -- lib/church-admin-readiness-data.test.ts lib/church-admin-readiness-modules.test.ts` - passed, 2 files and 19 tests.
- `npm run lint` - passed.
- `npm run build` - passed.
- `git diff --check` - passed.

## Residual Risk

- Communications and reports still need first-class readiness summaries.
- This run does not add browser smoke coverage.

## Delivery

- Branch: `feature/readiness-workflows-builder`
- Pull request: [#20](https://github.com/ricardojjulia/ChurchCore-Ops/pull/20)
- Merge: squash merge `307263c`
