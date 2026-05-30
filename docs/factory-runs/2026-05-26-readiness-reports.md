# Factory Run: Readiness Reports

**Date:** 2026-05-26  
**Factory surface:** Codex  
**Workflow:** `churchcore-feature-factory` with `churchcore-build-with-tests` implementation discipline  
**Roadmap phase:** Competitive Readiness Phase 1, Finish The Operator Path  
**Status:** Merged

## Intent

Add first-class reports readiness to the ChurchAdmin weekly readiness path so the operator can see whether member, event, giving, finance, and budget report inputs are present before relying on reports as a daily decision surface.

## Story And Acceptance Criteria

As a ChurchAdmin evaluator, I want reports readiness to appear in the weekly readiness path, so I can confirm the reporting suite has enough live data to explain what changed across people, events, giving, and finance.

Acceptance criteria:

- Reports readiness emits the shared `ReadinessSummary` contract.
- `/app/church-admin/readiness` includes reports without changing existing item semantics.
- Focused tests cover blocked, attention, and ready reporting input states.
- Local SQL fallback and Supabase reads populate reports readiness metrics from existing profile, event, donation, finance journal, and budget tables.
- English and Spanish readiness labels can render the new reports summary.
- Roadmap, application guide, MVP audit, changelog, README, and tracker reflect the run.
- Delivery uses branch and pull request workflow.

## Technical Brief

- Add a reports builder function to `lib/church-admin-readiness-modules.ts`.
- Add report metric fields to the ChurchAdmin readiness row.
- Read existing profile, event, donation, finance journal, and budget data for report coverage.
- Preserve existing report routes and target `/app/reports?range=90d`.
- No schema changes.
- No new dependencies.
- No role-access changes.

## Implementation Summary

Files changed:

- `lib/church-admin-readiness-modules.ts`
- `lib/church-admin-readiness-modules.test.ts`
- `lib/church-admin-readiness-data.ts`
- `lib/church-admin-readiness-data.test.ts`
- `components/application/church-admin-readiness-workspace.tsx`
- `lib/i18n.ts`
- `README.md`
- `CHANGELOG.md`
- `docs/application-guide.md`
- `docs/mvp-readiness-audit.md`
- `docs/plans/competitive-readiness-roadmap.md`
- `docs/factory-runs/README.md`
- `docs/factory-runs/2026-05-26-readiness-reports.md`

Patterns reused:

- Existing `ReadinessSummary` contract.
- Existing builder style from setup, accounts, people, events, children, volunteers, money, communications, and workflow readiness.
- Existing reports data model for member, event, giving, and finance reporting surfaces.
- Existing Vitest focused unit-test style.
- Existing factory-run tracking format.

## Verification

- `npm test -- lib/church-admin-readiness-data.test.ts lib/church-admin-readiness-modules.test.ts` - passed, 2 files and 25 tests.
- `git diff --check` - passed.
- `npm run lint` - passed.
- `npm run build` - passed.

## Residual Risk

- This run does not add browser smoke coverage for the report readiness target.
- This run does not add new report drilldowns or export workflows.
- This run uses report input coverage rather than a persisted report-generation audit table.

## Delivery

- Branch: `feature/readiness-reports-summary`
- Pull request: [#25](https://github.com/ricardojjulia/ChurchCore/pull/25)
- Merge: squash merge `c231ca7`
