# Factory Run: Wave B B3 Stripe Payment Intent

**Date:** 2026-05-31  
**Factory surface:** Codex  
**Workflow:** `churchcore-feature-factory` with
`churchcore-build-with-tests` implementation discipline  
**Roadmap phase:** Competitive Readiness Wave B, Slice B3  
**Status:** Delivered locally; pending PR merge

## Intent

Close the paid event registration gap where a registration could be recorded as
pending without immediately linking to a real Stripe Payment Intent.

## Story And Acceptance Criteria

As a church operator collecting paid registrations, I want each paid
registration to create and store a Stripe Payment Intent when possible, so the
payment ledger, registration record, and Stripe webhook reconciliation all share
the same durable identifier.

Acceptance criteria:

- Paid non-waitlisted registrations create a Stripe Payment Intent when Stripe
  is configured.
- Local/dev mode returns a deterministic safe stub intent instead of requiring
  live Stripe credentials.
- Member and public registration actions return the Payment Intent client
  secret so the UI can continue secure payment confirmation.
- The payment ledger stores `payment_intent_id` at registration creation.
- Stripe webhook reconciliation can match event registration payments by
  `payment_intent_id` when metadata omits the registration ID.
- Stripe intent creation failure leaves the registration in a pending follow-up
  state rather than failing the registration.

## Technical Brief

- Reuse the existing minimal Stripe HTTP client instead of adding the Stripe SDK.
- Add a registration-specific helper in `lib/stripe/event-registrations.ts`.
- Wire ChurchAdmin, member, and public registration creation paths to call the
  helper only when `paymentStatus === "pending"`.
- Upsert event registration payment ledger rows with `payment_intent_id` when
  available.
- Keep role, household, capacity, approval, and waitlist rules unchanged.
- Extend Stripe webhook handlers to resolve a registration from
  `event_registration_payments.payment_intent_id` when metadata lacks
  `event_registration_id` or `registration_id`.

## Implementation Summary

Files changed:

- `lib/stripe/event-registrations.ts`
- `app/app/member-actions.ts`
- `app/portal/actions.ts`
- `app/app/church-admin-actions.ts`
- `app/api/webhooks/stripe/route.ts`
- `app/app/member-actions.test.ts`
- `app/portal/actions.test.ts`
- `app/app/church-admin-actions.test.ts`
- `app/api/webhooks/stripe/route.test.ts`
- `components/application/member-event-registration-panel.tsx`
- `components/portal/public-event-registration-panel.tsx`
- `docs/application-guide.md`
- `docs/plans/competitive-readiness-roadmap.md`
- `docs/plans/competitive-readiness-30-day-execution.md`
- `docs/factory-runs/README.md`
- `docs/factory-runs/2026-05-31-wave-b-b3-stripe-payment-intent.md`
- `CHANGELOG.md`

Patterns reused:

- Existing `lib/stripe/client.ts` minimal Stripe request wrapper.
- Existing donation PaymentIntent result shape: `paymentIntentId`,
  `clientSecret`, and local stub behavior.
- Existing event registration lifecycle resolver and payment ledger upsert
  pattern.

## Verification

Passed:

- `npm run test -- app/api/webhooks/stripe/route.test.ts app/app/member-actions.test.ts app/portal/actions.test.ts app/app/church-admin-actions.test.ts components/application/member-event-registration-panel.test.tsx` - 5 files passed, 50 tests passed
- `npm run lint`
- `npm run build`
- `git diff --check`

## Residual Risk

- This slice establishes the server/client-secret contract and ledger linkage.
  Full Stripe Elements confirmation UI remains a follow-up polish slice for
  production checkout UX.
- When Stripe creation fails, the registration remains pending and visible in
  the Wave B B2 follow-up workflow.

## Delivery

- Branch: `feature/wave-b-b3-stripe-payment-intent`
- Pull request: #68
- Merge method: Pending protected-branch review and merge
- Final commit: Pending
