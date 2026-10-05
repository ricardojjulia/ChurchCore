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

## Council and verification

**Council Review 42** (`docs/reviews/2026-10-05-council-review-42-synthesis.md`, agents in `...-agents-1-5.md`): five separate read-only agents under Council v2. Status **AMENDED**; both required fixes landed in `149af55`. Readiness 86/100, up from 84. The Documenter close-out commit follows `149af55`.

**Intent.** One ChurchCore receipt per paid event registration, sent from the Stripe webhook, never duplicated, never recorded as sent unless the provider accepted it.

**Architecture impact.**
- New `lib/stripe/registration-receipt.ts`, called from `handlePaymentIntentSucceeded`. It uses claim-before-send with a 5-minute lease on `event_registration_payments`.
- Migration `20261007000000` adds nullable `receipt_claimed_at` and `receipt_sent_at`, with no backfill. Rollback: drop both columns (the receipt path then loses its duplicate guard).
- Council fix 1: `sendEmail()` (`lib/notifications/send-email.ts`) returns `provider_not_configured` in production when the SendGrid keys are unset, instead of a fake success (pre-existing, found by the Security seat). A small helper in `lib/notifications/email-provider.ts` is shared by the three callers. Donation receipts, recurring failure notices and registration receipts treat it as non-retryable: release the claim, warn, leave the sent marker unset, answer the webhook 200. Any other refusal still throws and is retried.
- Council fix 2: `tests/e2e/recurring-giving.spec.ts` gains the "change" step that Gap 3's definition of done required and the spec lacked.
- No new page, route or server action; the webhook route's manifest entry lists the new test.

**Verification.**
- Orchestrator, after `149af55`: `npx vitest run` 202 files / 2,459 tests pass; `npm run lint` 0 errors (1 pre-existing warning); `npx tsc --noEmit` clean; `npm run test:surfaces` OK.
- Builder: `npm run build` succeeds; `npm run lint:migrations` PASS; migration `20261007000000` applied on a fresh reset; `recurring-giving.spec.ts` + `api-webhooks.spec.ts` + `giving-statements.spec.ts` 31/31 pass locally (including the new "change" step); column-references DB test passes.
- **Not done:** CI (`verify`, 4 `e2e` shards), because no PR exists; commit signature check on GitHub; GitHub review comments. No real SendGrid or Stripe call has been made, so the receipt has never been sent to a real inbox.

**Residual risk.**
- Until G5.1 configures an email provider, receipts and failure notices stay unsent in production by design; unsent receipts are not yet visible to operators (S12).
- A church that enables Stripe's emailed receipts sends the registrant a second receipt (same as donations).
- Receipts are English only (S13). They skip `communication_suppressions`, as donation receipts do, on purpose.

**Follow-up work.** O11 (apply the migration after merge); G5.1 (receipts actually send in production, and decide whether to re-send receipts left unsent); S12; S13; then S11 and T1a for M3. Gap 3 closes when this PR merges.
