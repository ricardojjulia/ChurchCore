# Linked event operations from service-plan detail

## Intent

Reduce ChurchAdmin route switching by enabling event roster and check-in actions directly from event-linked service plans.

## Factory workflow

Codex build-with-tests workflow: extend the linked service-plan detail surface with shared event operations, keep church-scope boundaries enforced, and validate with focused tests.

## Story and acceptance criteria

- As a ChurchAdmin operator, I should be able to add an assigned volunteer to the linked event roster from the service-plan detail.
- As a ChurchAdmin operator, I should be able to check in an assigned volunteer on the linked event from the same plan detail view.
- As a system, linked event state should be reflected in the plan UI after these operations complete.

Acceptance criteria:

- Service-plan detail receives linked event roster/attendance state.
- Assigned volunteer rows expose roster/check-in actions when needed and status badges when already complete.
- Focused service-plan tests remain green.

## Technical brief

- Added linked event ops data mapping in the service-plan detail route.
- Added shared event operation handlers in the service-plan builder using existing ChurchAdmin event actions.
- Added row-level UI controls for roster and check-in actions on assigned volunteers when a linked event exists.

## Implementation summary

- Updated `app/app/church-admin/volunteers/schedules/[id]/page.tsx` to load linked event workspace data and map it to builder props.
- Updated `components/application/volunteer-schedule.tsx` with linked-event roster/check-in controls and state updates.
- Updated `app/app/church-admin/volunteers/schedules/[id]/page.test.tsx` for linked-event ops mapping coverage.

## Verification

Commands run:

- `npm run test -- app/app/volunteer-actions.test.ts app/app/church-admin/volunteers/schedules/page.test.tsx "app/app/church-admin/volunteers/schedules/[id]/page.test.tsx"` ✅

## Residual risk

- This slice improves per-volunteer event operations from service plans, but full roster/report parity between service-plan and event workspace still depends on future consolidation work.

## Delivery

- Branch: `feature/service-plan-linked-event-ops`
- Pull request: pending
- Merge: pending
- Final commit: pending