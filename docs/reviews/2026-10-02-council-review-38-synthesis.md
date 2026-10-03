# Council Review 38 — Synthesis (G3.1 + G3.2: recurring giving and installments)

**Branch:** `feat/recurring-giving-g3-1-g3-2` (four commits: the build, a Stripe cancel fix, the Council fixes, these docs) vs `main`. Diff-scoped, four distinct read-only agents (`2026-10-02-council-review-38-agents-1-4.md`).

## Verdict

**G3.1 and G3.2 meet their rows.** They ship together (owner decision) so no card is ever charged without being recorded.

- **Recurring gifts:** members set up (today or up to a year ahead), change, pause, resume and cancel. Each gift is a Stripe subscription on the church's own connected account. Admins see and manage them, and an anonymous giver is never named.
- **Installments:**
  - each one becomes one donation, keyed by its invoice, and is completed with its ledger post and receipt;
  - a failed installment is recorded and the donor told once;
  - subscription events sync the gift, in order.
- **Retry safety:** the webhook is retry-safe, answering 5xx on failure, with every step repeatable and the completion marker written last. A retry e2e proves it against the real route and database.
- **Public giving:** `/give/[slug]` takes real one-time gifts in production.

## Found by the orchestrator (fixed)

- **The public giving page was a mock-up.** Its submit waited 600ms and showed "Thank you… receipt sent" without charging or recording anything. It was reachable only in demo mode. Now it takes real gifts.
- **`cancelStripeSubscription` called `POST /v1/subscriptions/:id/cancel`,** an endpoint that doesn't exist for subscriptions; Stripe uses `DELETE /v1/subscriptions/:id`. No recurring gift could ever have been cancelled at Stripe. This was pre-existing, and is the same class as Council Review 34's malformed PaymentIntent parameter. Fixed, with a test pinning the request.
- **The webhook route answered 200 on handler errors,** and the donation path flipped to `succeeded` before the ledger post and receipt, so a failure in either was never retried. This is G3.2's widened definition of done.

## Fixed after Council

- A subscription created before a later failure is now cancelled at Stripe.
- A gift whose card was never confirmed stays incomplete: no "active" sync, no failure email.
- The retry e2e.
- The admin tab label is in i18n.
- The start date's time zone is stated.
- Focus moves on the card-step swap.
- The receipt copy is accurate.
- A comment states the orphan-journal contract.

## Wrong or unsupported agent claims (6)

1. **A2:** "Critical: missing role check". Overstated; the actions are scoped to the caller's own profile, like the one-time gift actions.
2. **A2:** "the manifest should mark actions public". No such field exists.
3. **A3:** "teal violates the design system". ADR 0026 keeps teal as the secondary accent.
4. **A3:** "demo card numbers above the real Stripe form". No Stripe form renders in demo mode.
5. **A3:** "no warning for a member with no email". Starting a gift requires one.
6. **A4:** "the SetupIntent is confirmed before the subscription exists". It's the reverse.

## Proposed (owner decision)

| # | Item | Proposal |
|---|---|---|
| 1 | A member can't update the card on a recurring gift. When a card expires, the gift goes past due, and the email tells them to contact their bank or the church. | **New Should row (~1 day):** "Update card" on each recurring gift, through Stripe's SetupIntent and the existing card step's setup mode. |
| 2 | A trialing subscription abandoned at the card step (browser closed) stays open at Stripe until its start date. It can't charge, since it has no card, and ChurchCore ignores it. | **New Should row (~0.5 day):** the existing cron cancels incomplete gifts' subscriptions after 24 hours. |
| 3 | An admin can't create a recurring gift on someone's behalf. | **After MVP.** |
| 4 | Platform setup needs three more Stripe events (`invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`), and O7's real run must cover a future-dated gift (the `pending_setup_intent`) and a paid installment. | **Widen O7** (documentation only). The deployment doc is already updated. |

## Readiness

**82/100** (from 80). Gap 3 is mostly closed: one-time, recurring, installments and public giving are all built. It isn't higher because G3.3 (statements) is open and nothing has run against real Stripe (O7).
