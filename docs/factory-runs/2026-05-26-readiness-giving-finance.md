# Factory Run: Readiness Giving And Finance

**Date:** 2026-05-26  
**Factory surface:** Codex  
**Workflow:** `churchcore-feature-factory` with `churchcore-build-with-tests` implementation discipline  
**Roadmap phase:** Competitive Readiness Phase 1, Finish The Operator Path  
**Status:** Verification passed, pull request pending

## Intent

Continue the module-owned readiness split by moving giving and finance readiness summary construction out of the central ChurchAdmin readiness composer.

## Story And Acceptance Criteria

As a ChurchAdmin evaluator, I want giving and finance readiness rules to be owned by a clear module builder, so money-related readiness checks can be tested independently from the weekly readiness composer.

Acceptance criteria:

- Giving and finance readiness emits the shared `ReadinessSummary` contract.
- `/app/church-admin/readiness` keeps the same ordered readiness items and target route.
- Focused tests cover missing giving page, failed donations, GL posting gaps, draft journals, and ready state.
- Roadmap, application guide, MVP audit, changelog, README, and tracker reflect the run.
- Delivery uses branch and pull request workflow.

## Technical Brief

- Add a giving/finance builder function to `lib/church-admin-readiness-modules.ts`.
- Keep current SQL and Supabase reads unchanged.
- Keep current UI rendering unchanged.
- Preserve target route: `/app/church-admin/giving?view=exceptions`.
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
- `docs/factory-runs/2026-05-26-readiness-giving-finance.md`

Patterns reused:

- Existing `ReadinessSummary` contract.
- Existing builder style from setup, accounts, people, events, children, and volunteer readiness.
- Existing Vitest focused unit-test style.
- Existing factory-run tracking format.

## Verification

- `npm test -- lib/church-admin-readiness-data.test.ts lib/church-admin-readiness-modules.test.ts` - failed first because the central workflow summary still needed `readinessCompletionStateFor` imported after the giving/finance split.
- `npm test -- lib/church-admin-readiness-data.test.ts lib/church-admin-readiness-modules.test.ts` - passed after restoring the workflow import, 2 files and 16 tests.
- `npm run lint` - passed.
- `npm run build` - passed.
- `git diff --check` - passed.

## Residual Risk

- Suggested workflows still need a module-owned builder.
- Communications and reports still need first-class readiness summaries.
- This run does not add browser smoke coverage.

## Delivery

- Branch: `feature/readiness-giving-finance-builder`
- Pull request: [#18](https://github.com/ricardojjulia/ChurchCore/pull/18)
- Merge: squash merge `ff57b0c`
