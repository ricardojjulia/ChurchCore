# Factory Run: Readiness Communications

**Date:** 2026-05-26  
**Factory surface:** Codex  
**Workflow:** `churchcore-feature-factory` with `churchcore-build-with-tests` implementation discipline  
**Roadmap phase:** Competitive Readiness Phase 1, Finish The Operator Path  
**Status:** Pull request open, merge pending

## Intent

Add first-class communications readiness to the ChurchAdmin weekly readiness path so queued sends, failed delivery, bounced logs, consent gaps, and contact gaps are visible from the operator command center.

## Story And Acceptance Criteria

As a ChurchAdmin evaluator, I want communications readiness to appear in the weekly readiness path, so delivery and audience-readiness problems are visible before the church depends on email or SMS workflows.

Acceptance criteria:

- Communications readiness emits the shared `ReadinessSummary` contract.
- `/app/church-admin/readiness` includes communications without changing existing item semantics.
- Focused tests cover failed/bounced delivery, pending/contact/consent attention, and ready state.
- Local SQL fallback and Supabase reads populate communications readiness metrics from existing tables.
- Roadmap, application guide, MVP audit, changelog, README, and tracker reflect the run.
- Delivery uses branch and pull request workflow.

## Technical Brief

- Add a communications builder function to `lib/church-admin-readiness-modules.ts`.
- Add communications metric fields to the ChurchAdmin readiness row.
- Read existing `communication_logs`, `profiles`, and `notification_preferences` data for pending sends, failed sends, bounced logs, contact gaps, and consent gaps.
- Preserve existing UI rendering and route to `/app/communications?view=readiness`.
- No schema changes.
- No new dependencies.
- No role-access changes.

## Implementation Summary

Files changed:

- `lib/church-admin-readiness-modules.ts`
- `lib/church-admin-readiness-modules.test.ts`
- `lib/church-admin-readiness-data.ts`
- `lib/church-admin-readiness-data.test.ts`
- `README.md`
- `CHANGELOG.md`
- `docs/application-guide.md`
- `docs/mvp-readiness-audit.md`
- `docs/plans/competitive-readiness-roadmap.md`
- `docs/factory-runs/README.md`
- `docs/factory-runs/2026-05-26-readiness-communications.md`

Patterns reused:

- Existing `ReadinessSummary` contract.
- Existing builder style from setup, accounts, people, events, children, volunteers, money, and workflow readiness.
- Existing communication operations data definitions for delivery and audience-readiness signals.
- Existing Vitest focused unit-test style.
- Existing factory-run tracking format.

## Verification

- `npm test -- lib/church-admin-readiness-data.test.ts lib/church-admin-readiness-modules.test.ts` - passed, 2 files and 22 tests.
- `git diff --check` - passed.
- `npm run lint` - passed.
- `npm run build` - passed.

## Residual Risk

- Reports still need a first-class readiness summary.
- This run does not implement real SendGrid/Resend/Twilio provider lifecycle, unsubscribe, bounce webhooks, retries, or suppression lists.
- This run does not add browser smoke coverage.

## Delivery

- Branch: `feature/readiness-communications-summary`
- Pull request: [#22](https://github.com/ricardojjulia/ChurchCore-Ops/pull/22)
- Merge: pending
