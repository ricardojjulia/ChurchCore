# Findings 4/5/6 depth batch

## Intent

Close remaining competitive-readiness depth on paid registration lifecycle defaults, migration import commit flow, and security evidence matrix coverage.

## Factory workflow

Codex build-with-tests workflow: map existing module patterns, implement incremental vertical slices, update tests/docs, run focused tests then lint/build.

## Story and acceptance criteria

- Paid registrations should persist deterministic payment lifecycle defaults.
- Import dry runs should support vendor source aliases and explicit commit with auditable summary output.
- Security evidence should include a living role-access matrix tied to executable tests.

Acceptance criteria:

- ChurchAdmin/member/public event registration writes persist `payment_status` defaults.
- ChurchAdmin import workspace supports source-system selection and batch commit.
- Import commit action remains church-admin-only and backend-gated.
- Security docs reference executable evidence paths for the new surfaces.

## Technical brief

- Added source-system adapter layer for people import row normalization.
- Added import batch commit service and ChurchAdmin action boundary for dry-run-completed batches.
- Added payment status lifecycle defaults to all three event registration entry paths.
- Added role-access matrix documentation and security/testing evidence refresh updates.

## Implementation summary

- Added `lib/people-import-source-adapters.ts` and tests in `lib/people-import-source-adapters.test.ts`.
- Expanded `lib/people-import-dry-run.ts`:
  - source-system-aware dry run parsing
  - committed-batch workflow (`commitPeopleHouseholdImportBatch`)
  - import batch status/summary update on commit
- Expanded ChurchAdmin import actions and tests:
  - `app/app/church-admin/people/import/actions.ts`
  - `app/app/church-admin/people/import/actions.test.ts`
- Expanded ChurchAdmin import workspace UX:
  - source-system selection
  - commit batch button + commit summary alert
  - `components/application/church-admin-people-import-workspace.tsx`
- Completed paid-registration lifecycle defaults:
  - `app/app/church-admin-actions.ts`
  - `app/app/member-actions.ts`
  - `app/portal/actions.ts`
  - regression tests in `app/app/church-admin-actions.test.ts` and `app/app/member-actions.test.ts`
- Added and referenced role-access matrix:
  - `docs/security-role-access-matrix.md`
  - `docs/security-assessment.md`
  - `docs/security-mitigation-plan.md`
  - `docs/testing-schema.md`
  - `docs/plans/competitive-readiness-30-day-execution.md`

## Verification

Commands run:

- `npm run test -- app/app/church-admin/people/import/actions.test.ts app/app/church-admin-actions.test.ts app/app/member-actions.test.ts lib/people-import-source-adapters.test.ts` ✅
- `npm run lint` ✅
- `npm run build` ✅
- `npm run setup:local` ✅
- `npm run smoke:local` ✅
- `npm run test:e2e:readiness` ✅ (3 passed, 1 skipped control-plane-context test)

## Residual risk

- Import commit currently supports people/household create/update paths only; groups/giving/events/attendance import commit paths remain follow-up work.
- Import commit failure reporting is summarized at batch level; row-level commit failure persistence can be expanded in a future slice.

## Delivery

- Branch: `feature/finding4-5-6-depth`
- Pull request: `#54` (merged)
- Merge method: auto-merge after required checks green
- Final commit: merged via PR #54
