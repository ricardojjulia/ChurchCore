# Factory Run: Wave B B2 Payment Follow-Up Operator UI

**Date:** 2026-05-31  
**Factory surface:** Codex  
**Workflow:** `churchcore-feature-factory` with
`churchcore-build-with-tests` implementation discipline  
**Roadmap phase:** Competitive Readiness Wave B, Slice B2  
**Status:** Delivered locally; pending PR merge

## Intent

Turn the Wave B payment lifecycle backend into an operator-facing workflow so a
ChurchAdmin can resolve unresolved event registration payments without
inspecting raw database rows.

## Story And Acceptance Criteria

As a ChurchAdmin reviewing an event roster, I want pending or failed
registration payments to show a clear follow-up action, so I can record the
resolved status and note from the same registration workspace.

Acceptance criteria:

- Unresolved payment registrants are surfaced in the existing payment follow-up
  filter/view.
- Operators can set a follow-up status and note and submit it through
  `updateRegistrationPaymentFollowUpAction`.
- Resolved payment records display follow-up note, actor, and timestamp context.
- Role checks remain server-side through the existing action gate.
- Focused page/action tests, lint, and build pass.

## Technical Brief

- Reuse the existing event registration workspace and payment follow-up filter
  rather than creating a separate operator route.
- Extend `loadEventRegistrationWorkspace` to read payment follow-up audit fields
  from `event_registration_payments`.
- Keep the action boundary in `updateRegistrationPaymentFollowUpAction`; the UI
  must not bypass server-side role and church-scope checks.
- Optimistically update the registration row after a successful action response.
- Document operator behavior and update the Wave B execution tracker.

## Implementation Summary

Files changed:

- `lib/church-admin-events-data.ts`
- `components/application/church-admin-event-workspace.tsx`
- `components/application/church-admin-event-workspace.test.tsx`
- `docs/application-guide.md`
- `docs/plans/competitive-readiness-30-day-execution.md`
- `docs/factory-runs/README.md`
- `docs/factory-runs/2026-05-31-wave-b-b2-payment-followup-operator-ui.md`
- `CHANGELOG.md`

Patterns reused:

- Existing payment follow-up filter and registration table surface.
- Existing `updateRegistrationPaymentFollowUpAction` server-side role/church
  gates.
- Existing Mantine panel/table patterns and component-test style.

## Verification

Passed:

- `npm run test -- components/application/church-admin-event-workspace.test.tsx app/app/church-admin-actions.test.ts` - 2 files passed, 25 tests passed
- `npm run lint`
- `npm run build`
- `git diff --check`

## Residual Risk

- This slice records manual follow-up resolution. Stripe Payment Intent creation
  at registration time remains Wave B Slice B3.
- The UI uses the current staff profile name for optimistic feedback; the
  server-loaded audit trail remains the durable source after refresh.

## Delivery

- Branch: `feature/wave-b-b2-payment-followup-ui`
- Pull request: #67
- Merge method: Pending protected-branch review and merge
- Final commit: Pending
