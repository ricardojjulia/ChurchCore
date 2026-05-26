# Factory Run: Readiness Target States

**Date:** 2026-05-26  
**Factory surface:** Codex  
**Workflow:** `churchcore-feature-factory` with `churchcore-build-with-tests` implementation discipline  
**Roadmap phase:** Competitive Readiness Phase 1, Finish The Operator Path  
**Status:** Merged

## Intent

Start the standardized readiness target-state pattern so ChurchAdmin operators can tell whether a target route is completed, empty, unavailable because no tenant backend is configured, blocked by permission, or showing validation work that still needs resolution.

## Story And Acceptance Criteria

As a ChurchAdmin evaluator, I want readiness target routes to explain their current state, so I know whether the issue is resolved, needs action, lacks live backend data, or has no matching records without reading source code.

Acceptance criteria:

- Add one shared target-state component for completed, empty, no-backend, permission-denied, and validation-error states.
- Wire the first slice into representative readiness targets: church settings, people readiness filters, and giving/finance exceptions.
- Preserve existing role gates and tenant data boundaries.
- Add focused component tests and browser smoke assertions for the standardized target-state evidence.
- Update roadmap, audit, testing, changelog, README, and factory tracker documentation.

## Technical Brief

- Add `components/application/readiness-target-state.tsx` as the shared Mantine target-state component.
- Add `source: "preview" | "live"` metadata to settings, people, and giving readiness loaders so target pages can distinguish no-backend preview from live state.
- Render target-state evidence in:
  - `components/application/church-admin-settings-workspace.tsx`
  - `components/application/church-admin-people-workspace.tsx`
  - `components/application/giving-analytics.tsx`
- Expand `tests/e2e/church-admin-readiness.spec.ts` so the first standardized target routes must render target-state evidence.
- Keep the broader target-route rollout as a documented follow-up.

## Implementation Summary

Files changed:

- `components/application/readiness-target-state.tsx`
- `components/application/readiness-target-state.test.tsx`
- `components/application/church-admin-settings-workspace.tsx`
- `components/application/church-admin-people-workspace.tsx`
- `components/application/giving-analytics.tsx`
- `lib/church-settings-data.ts`
- `lib/church-admin-people-data.ts`
- `lib/donations-data.ts`
- `tests/e2e/church-admin-readiness.spec.ts`
- `README.md`
- `CHANGELOG.md`
- `docs/mvp-readiness-audit.md`
- `docs/plans/competitive-readiness-roadmap.md`
- `docs/testing-schema.md`
- `docs/factory-runs/README.md`
- `docs/factory-runs/2026-05-26-readiness-target-states.md`

Patterns reused:

- Existing Mantine alert, button, group, and stack patterns.
- Existing route-level ChurchAdmin guards.
- Existing Playwright readiness route traversal.
- Existing factory-run tracking format.

## Verification

- `npm run test -- components/application/readiness-target-state.test.tsx` - passed.
- `npm run test:e2e:readiness` - passed with 3 Chromium tests passing and the existing Control Plane browser check skipped.
- `git diff --check` - passed.
- `npm run lint` - passed.
- `npm run build` - passed.

## Residual Risk

- This is the first slice. Remaining readiness target routes still need the same standardized state pattern.
- The permission-denied state is available in the shared component, but the current ChurchAdmin-only routes still redirect denied tenant roles instead of rendering an inline denied page.

## Delivery

- Branch: `feature/readiness-target-states`
- Pull request: #33
- Merge: squash merge `b311d2a`
