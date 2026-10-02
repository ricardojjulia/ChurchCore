# Council Review 34 — Agents 1–4 (G3.0: card form for online giving)

**Scope:** `feat/giving-card-form-g3-0`, commit `f9a054a` vs `main`, diff-scoped. Four distinct `codebase-researcher` agents (read-only by tool access). The orchestrator checked the claims below against source.

## Agent 1 — Database & API

- **Verified, HIGH:** `createPaymentIntent` sends `automatic_payment_methods: "enabled"`, which form-encodes as `automatic_payment_methods=enabled`. Stripe expects `automatic_payment_methods[enabled]=true`, so creating a PaymentIntent fails in live mode. `lib/stripe/event-registrations.ts:43` has the same bug. It was latent because live mode never ran before G3.0.
- **Verified:** the money path is idempotent. The atomic `pending → succeeded` update means only one of the action and the webhook posts to the GL and sends the receipt. The amount comes from the row, not the client.
- **Fair, Medium:** confirm and cancel match a gift by both ids plus church plus pending, but not by the giver. For a non-anonymous gift they can also require `profile_id` = the session's profile. An anonymous gift stores none, so the ids remain the proof.
- **Fair, Low:** the webhook's receipt has no church name (the action's does).
- **Unfounded:** "`cancellation_reason: abandoned` may be invalid." It's one of Stripe's documented values.

## Agent 2 — Routes & Pages

- **Verified:** there's one giving entry point (/app/member/giving), and the manifest is accurate.
- **Verified:** `redirect: "if_required"` with `return_url` = the page, but nothing reads `payment_intent` / `redirect_status` on return. Cards, including 3-D Secure, complete in-page, so this only matters for redirect-based methods, which automatic payment methods would offer.
- **Not an issue:** the actions aren't role-gated beyond the session. Any church person giving as themselves is legitimate, and the page gate is member-only.
- **Not an issue:** "re-opening creates a second pending row." Closing the drawer cancels the first.

## Agent 3 — UX & Shell

- **Verified:**
  - the card step shows the amount and fund;
  - errors are shown;
  - Pay is disabled until Stripe loads;
  - there's no Back to the amount (only Cancel, which abandons the gift);
  - the new strings are English-only.
- **Wrong:** "the error isn't announced." Mantine's `Alert` has `role="alert"` by default.
- **Inferred, unverified:** "the drawer overflows on phones."

## Agent 4 — Feature & Competitive

- **Verified:** G3.0's definition of done is met in code. Its e2e covers stub mode only (Stripe.js can't run in CI without keys); the component tests cover the declined path.
- **Verified by the orchestrator, HIGH, an owner question:** there is no Stripe Connect. `giving_page` configs store a `stripe_account_id`, but nothing sends `Stripe-Account`, `transfer_data` or `on_behalf_of`, so every church's gifts go to the one account that owns `STRIPE_SECRET_KEY`. The code comment ("the church's connected Stripe account") overstates this.
- **Verified by the orchestrator:** paid **event registrations** have no card form at all. `PaymentElement` appears only in the donation card step, so in live mode a paid registration shows "Secure payment ready" with nowhere to pay.
- **Wrong:**
  - "Apple/Google Pay work today": PaymentIntent creation fails;
  - "readiness 78–79": it holds at 77 until live payments can actually start.
