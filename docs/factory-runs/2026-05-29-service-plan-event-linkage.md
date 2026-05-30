# Service plan event linkage

## Intent

Extend the existing service-plan workflow so ChurchAdmin users can anchor a service plan to an existing church event without introducing a separate planning surface.

## Factory workflow

Codex build-with-tests workflow: extend the owning service-plan action and page code, add focused tests, then record the new workflow in product docs.

## Story and acceptance criteria

- As a ChurchAdmin operator, I should be able to link a service plan to a church event during creation or later editing.
- As the system, service-plan writes should reject event links that do not belong to the current church.
- As an operator, I should see the linked event context inside the service-plan workspace.
- As an operator, volunteer assignments from an event-linked service plan should retain that event linkage for downstream event operations.

Acceptance criteria:

- Create and update actions accept an optional church-scoped event link.
- Service-plan pages pass existing event options into the workspace and detail builder.
- Focused action/page tests cover valid linkage and out-of-scope rejection.
- Assignment writes carry linked `event_id` values when the plan is event-linked.

## Technical brief

- Added church-scoped event validation in `createServicePlanAction` and `updateServicePlanDetailsAction`.
- Wired ChurchAdmin event options into the service-plan list and detail pages.
- Updated the service-plan workspace UI to show and edit optional linked-event context.
- Propagated linked service-plan `event_id` values into volunteer shift assignment writes.
- Added a direct "Open Linked Event" action in the service-plan detail header for faster event-ops navigation.

## Implementation summary

- Updated `app/app/volunteer-actions.ts` to validate and persist optional `eventId` values.
- Updated `app/app/volunteer-actions.ts` assignment writes to persist linked plan `event_id` values in `volunteer_shifts`.
- Updated `components/application/volunteer-schedule.tsx` to surface linked-event selection/display and direct linked-event navigation.
- Updated `app/app/church-admin/volunteers/schedules/page.tsx` and `app/app/church-admin/volunteers/schedules/[id]/page.tsx` to load ChurchAdmin event options.
- Added focused test coverage in `app/app/volunteer-actions.test.ts`, `app/app/church-admin/volunteers/schedules/page.test.tsx`, and `app/app/church-admin/volunteers/schedules/[id]/page.test.tsx`.

## Verification

Commands run:

- `npm run test -- app/app/volunteer-actions.test.ts app/app/church-admin/volunteers/schedules/page.test.tsx "app/app/church-admin/volunteers/schedules/[id]/page.test.tsx"` ✅
- `npm run lint` ✅

## Residual risk

- This slice links service plans to existing events and propagates event linkage into volunteer shifts, but it does not yet merge event roster and service-plan assignment operations into one shared workspace.

## Delivery

- Branch: main working tree
- Pull request: pending
- Merge: pending
- Final commit: pending