# Factory Run: Readiness Target States Sensitive Ops

**Date:** 2026-05-27  
**Factory surface:** Codex  
**Workflow:** `churchcore-feature-factory` with `churchcore-build-with-tests` implementation discipline  
**Roadmap phase:** Competitive Readiness Phase 1, Finish The Operator Path  
**Status:** In PR

## Intent

Finish the standardized readiness target-state rollout for sensitive ChurchAdmin
targets so child-safety, finance-journal, communications, and reporting routes
explain whether they are complete, empty, unavailable, or need validation work.

## Story And Acceptance Criteria

As a ChurchAdmin operator, I want sensitive readiness target routes to show clear
state evidence, so I can resolve child-safety, finance, communications, and
reporting readiness gaps without codebase knowledge.

Acceptance criteria:

- Children's ministry readiness shows no-backend, completed, empty, or
  validation-error state.
- Finance journal readiness shows no-backend, completed, empty, or
  validation-error state.
- Communications readiness shows no-backend, completed, empty, or
  validation-error state.
- Reports readiness shows no-backend, completed, empty, or validation-error
  state.
- Playwright readiness traversal requires target-state evidence on all four
  sensitive routes.
- Focused tests cover the non-trivial readiness routing or state derivation.
- Changelog, roadmap, and factory tracker index are updated.

## Technical Brief

- Reuse `components/application/readiness-target-state.tsx`.
- Keep sensitive route access controls unchanged.
- Derive target-state evidence from data already loaded by each route where
  possible.
- Pass preview/live source from server pages so no-backend states remain
  explicit.
- Add target-state rendering to:
  - `components/application/ccm-dashboard.tsx`
  - `components/application/finance-journal-workspace.tsx`
  - `components/application/communications-hub.tsx`
  - `components/application/reports-dashboards.tsx`
- Expand `tests/e2e/church-admin-readiness.spec.ts` so the sensitive routes
  must render target-state evidence.

## Implementation Summary

Files changed:

- `app/app/church-admin/children/dashboard/page.tsx`
- `app/app/church-admin/finance/journals/page.tsx`
- `app/app/communications/page.tsx`
- `app/app/reports/page.tsx`
- `components/application/ccm-dashboard.tsx`
- `components/application/finance-journal-workspace.tsx`
- `components/application/communications-hub.tsx`
- `components/application/reports-dashboards.tsx`
- `tests/e2e/church-admin-readiness.spec.ts`
- `components/application/readiness-sensitive-targets.test.tsx`
- `app/app/church-admin/children/dashboard/page.test.tsx`
- `app/sign-in/page.test.tsx`
- `components/application/member-bottom-nav.test.tsx`
- `CHANGELOG.md`
- `docs/factory-runs/README.md`
- `docs/mvp-readiness-audit.md`
- `docs/plans/competitive-readiness-roadmap.md`
- `docs/testing-schema.md`
- `docs/factory-runs/2026-05-27-readiness-target-states-sensitive-ops.md`

Patterns reused:

- Existing shared `ReadinessTargetState` component.
- Existing page-level ChurchAdmin role guards.
- Existing preview/live source pattern from readiness target operations routes.
- Existing Playwright readiness traversal and factory-run tracking format.

Additional cleanup:

- Updated drifted sign-in and member-bottom-nav test harnesses so the full
  Vitest suite can run cleanly with current Next cookies and i18n behavior.

## Verification

- `npm run test -- components/application/readiness-target-state.test.tsx components/application/readiness-sensitive-targets.test.tsx app/app/church-admin/children/dashboard/page.test.tsx app/app/church-admin/volunteers/schedules/page.test.tsx` - passed with 13 tests.
- `npm run test:e2e:readiness` - passed with 3 Chromium tests passing and the existing Control Plane browser check skipped.
- `npm test` - passed with 32 test files and 145 tests.
- `git diff --check` - passed.
- `npm run lint` - passed.
- `npm run build` - passed.

## Residual Risk

- Permission-denied target state remains available in the shared component, but
  current ChurchAdmin-only routes continue to redirect denied tenant roles
  rather than rendering inline denied states.
- Reports readiness target-state evidence is shown for ChurchAdmin users on the
  90-day reports route; pastor access to the same reports surface remains a
  normal reports view without the ChurchAdmin readiness banner.

## Delivery

- Branch: `feature/readiness-target-states-sensitive-ops`
- Pull request: #38
- Merge: Pending
