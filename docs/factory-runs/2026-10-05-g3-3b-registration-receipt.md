# Factory run: G3.3b — ChurchCore's receipt for a paid event registration (2026-10-05)

**Plan row:** `DEVELOPMENT_PLAN.md` §0, G3.3b (Must, about 0.5 day, M3). The owner split it out of G3.3 on 2026-10-04, from Council Review 36's widening. **Branch:** `feat/registration-receipt-g3-3b`. The story and brief were approved by the owner on 2026-10-05.

## Context (from source)
- `app/api/webhooks/stripe/route.ts`, `handlePaymentIntentSucceeded`, marks `event_registrations` paid and updates `event_registration_payments`. That second update's `error` was never checked. ChurchCore sends no receipt of its own; the only receipt is Stripe's, sent through `receipt_email`, and only when the church has Stripe receipts enabled.
- `event_registration_payments` has `registration_id` (unique), `event_id`, `church_id`, `payment_intent_id`, `status`, `amount_cents` and `currency`. It has no receipt columns.
- `event_registrations` has `registrant_name`, `registrant_email` and `profile_id`.
- The donation receipt pattern lives in `lib/stripe/donation-completion.ts`. It sends through `sendEmail`, claims the receipt for `RECEIPT_LEASE_MS = 5 min` before sending, writes `receipt_sent_at` only once the provider accepts, and throws on refusal so the webhook answers 5xx and Stripe retries (G3.2).

## Story
As someone who paid for an event registration, I get one receipt from my church, so I have a record of what I paid for.

## Acceptance criteria
1. When a registration's card payment succeeds, the registrant gets one ChurchCore receipt email. It shows:
   - the church's name, and its mailing address and contact email when set;
   - the event title and the event's church-local date and time;
   - the registrant's name;
   - the amount and currency;
   - a payment reference (the registration payment id);
   - the sentence "This is a receipt for an event registration fee. It is not a tax-deductible donation receipt."
2. It is sent exactly once:
   - A webhook retry, a duplicate event, or two concurrent deliveries never send a second email.
   - A claim older than 5 minutes may be taken over.
   - `receipt_sent_at` is written only after the provider accepts the email.
3. If the provider refuses the email, the claim is released and the handler throws, so the webhook answers 5xx and Stripe retries. The registration and payment updates are idempotent, so a retry is safe.
4. A registration with no email gets no receipt, and the webhook still succeeds. A free registration, or an admin-added walk-in with no PaymentIntent, gets none either.
5. User-supplied text (registrant, event and church names) is HTML-escaped in the email.
6. The `event_registration_payments` update in the webhook checks its `error`.
7. An additive migration adds `receipt_claimed_at timestamptz` and `receipt_sent_at timestamptz` (nullable) to `event_registration_payments`. Its rollback is stated.
8. Tests cover:
   - content, including escaping and the not-deductible line;
   - the claim and the lease takeover;
   - a second call sending nothing;
   - refusal releasing the claim and throwing;
   - no email;
   - the webhook calling it only for a registration.
   - The webhook route's manifest entry gains the new test file.
