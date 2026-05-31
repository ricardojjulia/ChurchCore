# Factory Run: Wave B B4 Paid Registration Checkout UI

**Date:** 2026-05-31  
**Factory surface:** Codex  
**Workflow:** `churchcore-feature-factory` with
`churchcore-build-with-tests` implementation discipline  
**Roadmap phase:** Competitive Readiness Wave B, Slice B4  
**Status:** Delivered locally; pending PR merge

## Intent

Complete the user-facing closeout for Wave B by turning the B3 Payment Intent
client-secret contract into visible paid-registration checkout states for member
and public event registration flows.

## Story And Acceptance Criteria

As a member or public guest registering for a paid event, I want to see that
payment is required before submitting and that secure payment is ready after
registration, so I understand the next step without exposing payment secrets.

Acceptance criteria:

- Paid member registrations show payment-required messaging before submit.
- Paid public registrations show payment-required messaging before submit.
- Member/public registration modals show a secure payment-ready panel when the
  server returns `paymentClientSecret` and `paymentIntentId`.
- The UI displays the Payment Intent ID for traceability but never renders the
  client secret.
- Free, waitlist, already-registered, and approval-required flows keep their
  existing success states.
- Focused component tests, lint, and build pass.

## Technical Brief

- Do not add Stripe frontend dependencies in this slice because the repository
  does not currently include `@stripe/stripe-js` or `@stripe/react-stripe-js`.
- Implement the staged checkout confirmation state allowed by the B4 scope.
- Keep the B3 server contract intact and consume only the returned
  `paymentClientSecret` as a signal that payment confirmation is ready.
- Never render the client secret; show only the Payment Intent ID and amount.
- Keep the UI consistent with existing Mantine modal/panel patterns.

## Implementation Summary

Files changed:

- `components/application/member-event-registration-panel.tsx`
- `components/application/member-event-registration-panel.test.tsx`
- `components/portal/public-event-registration-panel.tsx`
- `components/portal/public-event-registration-panel.test.tsx`
- `docs/application-guide.md`
- `docs/plans/competitive-readiness-roadmap.md`
- `docs/plans/competitive-readiness-30-day-execution.md`
- `docs/factory-runs/README.md`
- `docs/factory-runs/2026-05-31-wave-b-b4-paid-registration-checkout-ui.md`
- `CHANGELOG.md`

Patterns reused:

- Existing Mantine modal/Alert/Paper UI structure.
- Existing member/public registration action result contracts.
- Existing component-test pattern with mocked server actions.

## Verification

Passed:

- `npm run test -- components/application/member-event-registration-panel.test.tsx components/portal/public-event-registration-panel.test.tsx` - 2 files passed, 5 tests passed
- `npm run lint`
- `npm run build`
- `git diff --check`

## Residual Risk

- This slice does not install or render Stripe Elements. It prepares the
  payment-ready UI state and keeps the client secret hidden until a later
  production checkout integration adds the Stripe frontend dependency.

## Delivery

- Branch: `feature/wave-b-b4-paid-registration-checkout-ui`
- Pull request: #69
- Merge method: Pending protected-branch review and merge
- Final commit: Pending
