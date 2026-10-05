Status: AMENDED
Date: 2026-10-05
Branch: feat/registration-receipt-g3-3b vs main (18ed864)
Related: DEVELOPMENT_PLAN §0 row G3.3b; Gap 3 definition of done; migration 20261007000000; factory run docs/factory-runs/2026-10-05-g3-3b-registration-receipt.md; memory feedback_stub_success_gating (Council Reviews 22/23)
Tags: giving, events, email, webhooks
Surfaces: POST /api/webhooks/stripe (changed); no pages or server actions

# Council Review 42 — Synthesis (G3.3b: ChurchCore's receipt for a paid event registration)

Five separate read-only agents ran (Council v2). Their reports are in `2026-10-05-council-review-42-agents-1-5.md`.

## Status

**AMENDED.** The branch is ready once the two fixes below land. The owner decides.

**What the branch does:**
- When a registration payment succeeds, the Stripe webhook sends one ChurchCore receipt by email. It names the church, the event and its church-local time, and the amount, and says the fee is not a tax-deductible donation.
- The receipt is claimed with a lease on `event_registration_payments`. The lease uses migration `20261007000000` and the same `.or()` filter as the proven donation-receipt code.
- `receipt_sent_at` is written only after the provider accepts the email. A refusal releases the claim and returns 5xx, so Stripe retries.
- The previously unchecked `event_registration_payments` update now checks its error.

## Fixes required

1. **`sendEmail()` reports a fake success in production** (A5; confirmed at `lib/notifications/send-email.ts:36-43`).
   - The bug: with no `SENDGRID_API_KEY` or `SENDGRID_FROM_EMAIL`, it returns `{ accepted: true }` in every environment. Donation receipts, recurring-gift failure notices, and now registration receipts all go through it. A keyless production deploy therefore records receipts as sent that never went out. This is the class that Council Reviews 22 and 23 fixed in the communications adapters; this direct path was missed. It predates this branch, which adds a third caller.
   - **Fix:** when the keys are absent and `stubsAllowed()` is false, return `{ accepted: false, error: "provider_not_configured" }`.
   - The three callers treat `provider_not_configured` as "cannot send yet", not as transient. They:
     - release the claim;
     - log a warning;
     - leave `receipt_sent_at` (or the notice marker) unset, so the receipt stays visibly unsent;
     - do **not** throw, so the webhook still answers 200. Without this, every Stripe webhook would fail and be retried for days until an email provider is live (G5.1).
   - The donation completion proceeds to `completed_at` in that case, so the gift is complete and its receipt is unsent.
   - Every other refusal still throws and is retried, as before.
   - Tests cover each caller, plus `sendEmail` with stubs allowed and with stubs disallowed.
2. **Gap 3's definition of done names a journey that doesn't exist** (found by the orchestrator while checking A4).
   - Gap 3's definition of done requires "recurring create, **change** and cancel" in CI. `tests/e2e/recurring-giving.spec.ts` sets a gift up, pauses it, resumes it and cancels it, but never changes one.
   - **Fix:** add a step that changes the gift's amount (and its fund or frequency, if the UI offers them) through the UI and asserts the stored row.
   - With this step, and with G3.3 already merged (#181), Gap 3 can be declared closed on merge.

## Consensus

- **The claim, lease and send pattern is race-safe, and matches donation receipts** (A1, A5).
- **Tenancy and the recipient are sound** (A5):
  - every query is scoped by `church_id`;
  - the recipient comes from the registration row, not from PaymentIntent metadata;
  - the metadata is set server-side.
- **HTML is escaped, and the receipt carries no links** (A2, A3, A5).
- **Manifest and wiring are correct** (A2): the webhook route's entry lists the new test, and both registration flows reach the webhook.

## Recorded, not fixed

- **Possible second receipt** (A3). If a church enables Stripe's emailed receipts, the registrant also gets Stripe's own receipt, because `receipt_email` is set on the PaymentIntent. Donations behave the same way today (`lib/stripe/donations.ts:151`). Kept for consistency.
- **Receipts are English only** (A3). Donation receipts are too. Tracked with the i18n sweep (S13).
- **Transactional receipts skip `communication_suppressions`** (A5). Donation receipts do the same. That is intentional for a receipt of an action the person just took.
- **Operator visibility of unsent receipts** depends on S12, the Should row for surfacing missing provider config.

## Wrong or unsupported agent claims (6)

1. **A1 and A4: "`sendEmail(idempotencyKey: payment.id)` makes retries safe."** `send-email.ts` sends that key as an `X-Twilio-Email-Event-Webhook-Signature` header, which SendGrid ignores (the Review 40 follow-up). The only duplicate guard is the claim plus `receipt_sent_at`.
2. **A2: "Public and member registration flows E2E covered" for the receipt.** `api-webhooks.spec.ts` checks that the webhook marks the registration paid. No receipt send is exercised end to end, as the builder stated.
3. **A3: "Subject line doesn't escape eventTitle — minor injection risk."** A subject is plain text sent as a JSON field, not HTML, so escaping doesn't apply.
4. **A3: "Footer `#666` at 12px fails WCAG AA."** `#666` on white is about 5.7:1 (luminance 0.133 against 1.0), which passes AA's 4.5:1 for normal text.
5. **A4: "G3.3 (year-end statements): not yet merged … Gap 3 remains open until G3.3 also merges."** G3.3 merged as #181 (`b29a255`). A4 read the stale Review 40 bullets that the Documenter had already flagged.
6. **A4: "13 Must rows / 20 factory days remain … 5–6 days of slack."** This is inconsistent with the Documenter's recount from the table (Review 40): 10.5 days of slack once G3.3 merged. The Documenter recounts it at close-out.

## Score

**Readiness: 86/100**, up from 84, once this merges with both fixes.
- G3.3b is done.
- Gap 3 closes on its own definition of done (G3.0–G3.3b, plus giving journeys in CI that now include "change").
- A4 proposed 86 for the wrong reason, a G3.3 still pending. The number holds because Gap 3 closes.

## Prompt A — Council Review 42 fixes

**Files:**
- `lib/notifications/send-email.ts` and its tests
- `lib/stripe/donation-completion.ts`
- `lib/stripe/recurring-webhooks.ts`
- `lib/stripe/registration-receipt.ts`
- tests for those three modules
- `tests/e2e/recurring-giving.spec.ts`

**Work:** fixes 1–2 above.

**Verification:**
- `npx vitest run`
- lint
- `tsc`
- `test:surfaces`
- build
- `npm run test:e2e:local -- tests/e2e/recurring-giving.spec.ts tests/e2e/api-webhooks.spec.ts tests/e2e/giving-statements.spec.ts`

## Definition of done

Evidence recorded by the Documenter on 2026-10-05, after `149af55`. Unticked means not yet verified.

- [x] Unit tests pass (count): `npx vitest run` 202 files / 2,459 tests (orchestrator-run)
- [x] Surfaces: `npm run test:surfaces` OK (orchestrator-run)
- [x] Lint: 0 errors (1 pre-existing warning in `localization-governance.config.mjs`)
- [x] Types: `npx tsc --noEmit` clean
- [x] Build succeeds (builder-run)
- [ ] E2E: the touched specs pass locally (builder: `recurring-giving`, `api-webhooks`, `giving-statements`, 31/31, including the new "change" step); CI `verify` and 4 `e2e` shards: pending PR
- [x] Migration `20261007000000`: `lint:migrations` PASS, fresh-reset apply done (builder), additive and nullable, rollback stated in the file and in the plan; owner action row O11 added to apply it to hosted Supabase after merge
- [ ] Commits verified on GitHub: pending PR
- [ ] GitHub review comments read, fixed or answered, threads resolved: pending PR
- [x] Documenter close-out committed (this commit: plan, changelog, README, application guide, communications runbook, factory-run note, memory)
