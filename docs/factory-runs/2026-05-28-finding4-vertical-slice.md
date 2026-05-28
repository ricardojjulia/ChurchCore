# Factory Run: Finding 4 Vertical Slice (Service Planning + Registration)

Date: 2026-05-28

## Intent

Start Finding 4 from the competitive-readiness roadmap with a coherent vertical slice that adds:

- service planning metadata and run-of-service planning
- registration approval workflow and intake form configuration

## Architecture Impact

- Added migration `20260528133000_finding4_service_planning_registration.sql`.
- Extended `service_plans` metadata for service type and worship planning context.
- Added `service_plan_items` for run-of-service order and schedule blocks.
- Extended `event_registration_settings` with approval and household policy flags.
- Added `event_registration_form_fields` for configurable event intake schema.
- Extended registration status check constraint with `pending_approval`.

## Product Surface Updated

- Service plan detail builder now supports:
  - metadata editing (service type, scripture, sermon title/speaker)
  - run-of-service item creation and visibility
- Event registration operations now support:
  - approval-required registration state transitions
  - configurable registration form fields
  - household registration policy setting

## Verification Commands

Planned verification for this slice:

- `npm run test -- app/app/volunteer-actions.test.ts app/app/church-admin-actions.test.ts`
- `npm run lint`
- `npm run build`

## Risks And Follow-up

- Follow-up UI refinement: replace free-text type inputs with constrained selects for service/item field types.
- Follow-up workflow: public/member registration form rendering from `event_registration_form_fields` is still pending.
- Follow-up payment linkage: registration payment records and Stripe/finance reconciliation remain in later Finding 4 slices.
