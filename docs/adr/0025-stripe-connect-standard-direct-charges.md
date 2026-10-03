# ADR 0025 — Online Payments Run on Each Church's Own Stripe Account (Connect Standard, Direct Charges)

**Status:** Accepted (Council Review 35, 2026-10-02 — every decision below checked against the shipped code; none overclaim)
**Date:** 2026-10-02
**Authors:** G3.0b, Council Review 34 (owner decisions 2026-10-02)

---

## Context

G3.0 gave members a card form, and Council Review 34 found where the money would go: every Stripe call used the one `STRIPE_SECRET_KEY` on the server. Gifts and event payments for every church on a deploy would land in that single account. A `stripe_account_id` column on `public_giving_pages` existed but was never read, and a code comment describing "the church's connected Stripe account" was aspirational.

ChurchCore's promise is that a gift goes straight to the church, with no platform fee. A multi-church deploy can't keep that promise from one account.

## Decision

1. **Stripe Connect with Standard accounts.** Each church connects its own full Stripe account, or creates one, through **Stripe OAuth** ("Connect with Stripe"). The church owns its dashboard, payouts, refunds and disputes. ChurchCore holds no funds and carries no payment liability.
2. **Direct charges.** Every PaymentIntent, customer, refund and subscription for a church is created on that church's account: every Stripe API call carries `Stripe-Account: <church account>`. The church is the merchant of record and its name is on the card statement. There's no `application_fee_amount`.
3. **Connect is required for live payments, with no fallback.** A church's online giving and paid event registration are live only when the church has connected and Stripe reports `charges_enabled`. Until then the pages say online payment isn't set up. The server's own key is the *platform* key: it authenticates ChurchCore to Stripe and never receives a church's money.
4. **One table owns the link.** `church_payment_accounts` (church_id primary key, stripe_account_id unique, charges_enabled, details_submitted, connected_at, disconnected_at). Church admins can read their church's row; only the server writes it (church-scoped admin client, ADR 0022).
5. **Webhooks know the account.** Events from connected accounts arrive signed with the Connect endpoint's secret (`STRIPE_CONNECT_WEBHOOK_SECRET`) and carry `event.account`. The handler resolves the church from that account and requires it to match the payment's `metadata.church_id`. `account.application.deauthorized` marks the church disconnected; `account.updated` refreshes `charges_enabled`.
6. **The browser loads Stripe.js for the church's account** (`loadStripe(pk, { stripeAccount })`), so the Payment Element confirms on that account.

## Consequences

- **Onboarding.** A church admin connects once, from church settings, and can disconnect. The OAuth `state` is signed and bound to the church and the admin, so a callback can't attach an account to another church.
- **Owner setup.** The platform needs `STRIPE_CONNECT_CLIENT_ID` (ca_…), the Connect OAuth redirect URL registered in Stripe, and a Connect webhook endpoint with its secret, besides the existing keys.
- **Every Stripe helper takes the church's account.** A call without one is a bug; the helpers refuse rather than default to the platform account.
- **Recurring gifts (G3.1)** are built on connected accounts from the start, so nothing migrates later.
- **Out of scope:** the `/give/[slug]` public giving page (a demo-only scaffold), Express accounts, platform fees.

## Alternatives considered

- **Express accounts:** a branded onboarding, but ChurchCore takes on support and some liability. Rejected by the owner.
- **Destination charges from a platform account:** ChurchCore would be merchant of record and handle disputes. Rejected.
- **Keep the single account as a fallback for one-church deploys:** two payment paths to maintain and test, and money could land in the wrong account if misconfigured. Rejected (decision 3).

## Implementation notes (added 2026-10-02, Council Review 35)

Checked against the shipped code (`f45b7e8`); every decision above is met as written.

- **`donations.stripe_account_id` and `event_registration_payments.stripe_account_id`** (migration `20261003000000`, nullable) record the account each payment was charged on. A later refund or subscription cancel goes to that account **only while it is still the church's connected account** (`accountForExistingPayment()`, `lib/stripe/connect.ts`). Disconnecting revokes ChurchCore's access to the account at Stripe, so payments made on it are then managed from that account's own Stripe Dashboard, and ChurchCore says so (`PAYMENT_ACCOUNT_DISCONNECTED`) rather than calling the church's new account. A null row (pre-Connect or stubbed) uses the church's current account. *Corrected after the PR #174 review: the first draft of this note claimed these operations kept working after a disconnect and reconnect, which revoked access makes impossible.*
- **One account per church, one church per account.** `church_id` is the primary key, and `stripe_account_id` is `unique`. A church switches accounts only by disconnecting first: the start route and the callback both refuse with `already_connected`. An account another church is still connected to is refused with `in_use`, and ChurchCore does not revoke it, since access is per platform, not per church, so revoking would cut that church off. An account another church connected and then disconnected can be linked: its old link gives way.
- **The callback leaves no unlinked access (PR #174 review).** If anything fails after Stripe has authorized the account (the status read or the save), the callback revokes the authorization. It does so only once it has confirmed no other church is connected to that account; if it can't tell, it doesn't revoke.
- **Account events can arrive out of order (PR #174 review).** `account.application.deauthorized` and `account.updated` carry the event's `created` time. The update applies only to a link made at or before that time (`connected_at <= created`), so a late or retried deauthorization can't disconnect a church that has since reconnected.
- **`stripeRequest` (`lib/stripe/client.ts`) now handles two Stripe error shapes.** The regular API nests errors (`{ error: { message } }`); Connect OAuth returns them flat (`{ error: "invalid_client", error_description }`). Before this fix (found by the orchestrator while building, not by the Council), every OAuth failure read as a generic "Stripe 401", which meant disconnecting an account the church had already revoked at Stripe could never succeed — the real error (`invalid_client`) never surfaced for the disconnect action's tolerated-error check to match. The tolerated-error match itself was narrowed from `/invalid/` (which would have also matched "Invalid API Key" and wrongly marked a still-connected church disconnected) to Stripe's exact "is not connected to stripe account" message.
- **Residual risk (tracked as owner action O7, `DEVELOPMENT_PLAN.md` §0.3):** no test — unit, DB or e2e — exercises real Stripe. Every Stripe call in the test suite is mocked or stubbed, and CI has no Stripe keys, so the OAuth handshake, a live direct charge, and the Connect webhook's signature and `event.account` scoping have never run against Stripe itself. Before live giving is announced, the platform needs its own Connect setup (`STRIPE_CONNECT_CLIENT_ID`, the OAuth redirect registered at Stripe, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, a Connect webhook endpoint and its `STRIPE_CONNECT_WEBHOOK_SECRET`) and one test-mode run with a real connected account.

## Implementation notes (added 2026-10-02, Council Review 36)

- **Event-registration payments now also run on the church's own account through one shared helper, `lib/event-registration-payment.ts`** (G3.0c), used by both the public portal and the member registration paths. It calls `createEventRegistrationPaymentIntent` (itself Connect-aware per the decisions above), records the resulting `stripe_account_id` on the payment row, and cancels the PaymentIntent at Stripe — on that same account — if the registrant leaves the card step without paying, or if the payment row itself fails to save after the PaymentIntent was created.
- **The admin "add registrant" path creates no PaymentIntent at all**, on any account, connected or not (owner-confirmed, Council Review 36). An admin adding a walk-in is recorded as payment-due, to collect in person, rather than refused at an unconnected church or given a card form nobody in the room needs. This is a deliberate exception to decision 3 above ("Connect is required for live payments, with no fallback") for the admin-recorded path specifically — the exception is the admin never takes a card through ChurchCore for this path, so there is no payment to route to any account.

## Implementation notes (added 2026-10-02, Council Review 38)

- **Recurring gifts (G3.1) run on connected accounts from the start, as decision 2 above required.** A `recurring_gifts` subscription is a Stripe subscription created with `Stripe-Account` set to the church's own connected account, exactly like a one-time PaymentIntent — there is no separate "platform subscription" path to migrate off later.
- **Each church gets one Stripe product, "Recurring gift," created once per connected account** (`church_payment_accounts.stripe_recurring_product_id`, migration `20261004000000`) and reused for every member's subscription at that church; each gift's own amount is set on its subscription's price, not the product. This keeps one product per church rather than one per gift.
- **`cancelStripeSubscription` called `POST /v1/subscriptions/:id/cancel`, which doesn't exist — Stripe cancels a subscription with `DELETE /v1/subscriptions/:id`.** Subscriptions have no `/cancel` endpoint; only PaymentIntents do, and the two were conflated. This is pre-existing, found while building G3.1, and is the same class of defect as Council Review 34's malformed `automatic_payment_methods` parameter (ADR 0025's own prior implementation note, Review 35): a wrong Stripe wire format in code nobody had run against real Stripe. No recurring gift could ever have been cancelled at Stripe before this fix (`8149031`); a test now pins the exact request (method, path, no body).
- **Completion order is retry-safe and shared across every gift-money path.** `completeDonation` (`lib/stripe/donation-completion.ts`) is the one function the Stripe webhook, the member's own confirm action, and the public-giving stub path all call: mark the donation `succeeded`, then post it to the ledger (idempotent — a half-written journal from an earlier attempt is replaced, not duplicated), then send the receipt (claimed by a single-row update before sending, so two concurrent attempts can't both send one, and released if the send is refused), then write `completed_at` last, once every other step has actually succeeded. A webhook retry (Stripe resending the same event, or a different event for the same invoice) resumes at whichever step didn't complete, rather than restarting or skipping. The Stripe webhook route itself now answers 5xx on a handler failure instead of 200, so Stripe actually retries — before this fix, a failure in the ledger post or the receipt was permanent, since Stripe never got a reason to try again.
- **Residual risk, folded into O7 (`DEVELOPMENT_PLAN.md` §0.3):** the platform's Connect webhook subscription needs three more events for recurring giving (`invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`; `docs/setup/production-deployment.md` already lists all nine), and the one real test-mode run O7 requires must also exercise a future-dated recurring gift (Stripe returns `pending_setup_intent` for a trialing `default_incomplete` subscription — Council Review 38's Agent 1 flagged this as unverified, correctly, since only a real Stripe run can prove it) and a paid installment, not just a one-time gift.
