# Factory Run: Readiness Target States Operations

**Date:** 2026-05-26  
**Factory surface:** Codex  
**Workflow:** `churchcore-feature-factory` with `churchcore-build-with-tests` implementation discipline  
**Roadmap phase:** Competitive Readiness Phase 1, Finish The Operator Path  
**Status:** Merged

## Intent

Continue the readiness target-state rollout for the lower-risk operations routes before handling child-safety, finance-journal, communications, and reporting surfaces in a separate sensitive-ops run.

## Story And Acceptance Criteria

As a ChurchAdmin operator, I want account approvals, event roster review, volunteer service plans, and suggested workflows to explain whether they are complete, empty, unavailable, or need validation work, so I can resolve weekly readiness issues without source-code knowledge.

Acceptance criteria:

- Account approval readiness shows no-backend, completed, or validation-error state.
- Event roster readiness shows no-backend, completed, empty, or validation-error state.
- Volunteer service-plan readiness shows no-backend, completed, empty, or validation-error state.
- Suggested workflow readiness shows no-backend, completed, empty, or validation-error state.
- Playwright readiness traversal requires target-state evidence on these operations routes.
- Docs distinguish this operations run from the follow-up sensitive-ops run.

## Technical Brief

- Reuse `components/application/readiness-target-state.tsx`.
- Add source metadata to account request and ShepherdAI workflow queue loaders.
- Derive preview/live source for event list and volunteer service-plan pages at the server page boundary.
- Add target-state rendering to:
  - `components/application/church-admin-accounts-workspace.tsx`
  - `components/application/church-admin-event-workspace.tsx`
  - `components/application/volunteer-schedule.tsx`
  - `components/application/shepherd-workflow-queue.tsx`
- Expand `tests/e2e/church-admin-readiness.spec.ts` so the operations target routes must render target-state evidence.

## Implementation Summary

Files changed:

- `app/app/church-admin/events/page.tsx`
- `app/app/church-admin/volunteers/schedules/page.tsx`
- `app/app/church-admin/volunteers/schedules/page.test.tsx`
- `app/app/church-admin/workflows/page.tsx`
- `components/application/church-admin-accounts-workspace.tsx`
- `components/application/church-admin-event-workspace.tsx`
- `components/application/shepherd-workflow-queue.tsx`
- `components/application/volunteer-schedule.tsx`
- `lib/church-admin-accounts-data.ts`
- `lib/shepherd-ai/ops-data.ts`
- `tests/e2e/church-admin-readiness.spec.ts`
- `README.md`
- `CHANGELOG.md`
- `docs/mvp-readiness-audit.md`
- `docs/plans/competitive-readiness-roadmap.md`
- `docs/testing-schema.md`
- `docs/factory-runs/README.md`
- `docs/factory-runs/2026-05-26-readiness-target-states-operations.md`

Patterns reused:

- Existing shared `ReadinessTargetState` component.
- Existing route-level ChurchAdmin guards and readiness banners.
- Existing Playwright readiness traversal and factory-run tracking format.

## Verification

- `npm run test -- components/application/readiness-target-state.test.tsx app/app/church-admin/volunteers/schedules/page.test.tsx` - passed.
- `npm run test:e2e:readiness` - passed with 3 Chromium tests passing and the existing Control Plane browser check skipped.
- `git diff --check` - passed.
- `npm run lint` - passed.
- `npm run build` - passed.

## Residual Risk

- Sensitive-ops readiness targets remain for the next run: children's dashboard, finance journals, communications, and reports.
- Permission-denied state remains available in the shared component, while current ChurchAdmin-only routes still redirect denied tenant roles instead of rendering inline denied states.

## Delivery

- Branch: `feature/readiness-target-states-rollout`
- Pull request: #35
- Merge: squash merge `668289a`
