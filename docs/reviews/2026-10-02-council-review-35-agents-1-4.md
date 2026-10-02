# Council Review 35 — Agent reports (G3.0b: Stripe Connect)

**Branch:** `feat/stripe-connect-g3-0b` (`f45b7e8`) vs `main` (`13d0413`). Diff-scoped. Four distinct read-only `codebase-researcher` agents, run in parallel. Below: each report's findings, condensed, with the orchestrator's check of each against source.

## Agent 1 — Database & API

- **Finding (labelled Critical, "mitigated"):** the local-SQL branch of the registration refund (`app/app/church-admin-actions.ts:2038-2045`) doesn't pass the payment's Stripe account.
  - *Check:* true, but that branch is dead code. `shouldUseLocalTenantFallback()` always returns `false` (`lib/supabase/tenant.ts:40-44`, the Supabase-only mandate). The live Supabase branch passes `payData.stripe_account_id` (`:2116-2134`). **Low, not Critical.**
- **Verified correct:**
  - **Table protection:** `church_payment_accounts` RLS is read-only for the church's admins. There are no client writes, and anon has no access. This is backed by `tests/database/church-payment-accounts-rls.test.ts`.
  - **Account on every live call:** every live Stripe call carries the church's account, and a call without one throws.
  - **OAuth state:** signed, expiring, nonce'd, and bound to the church and the admin.
  - **Webhook:** fails closed and scopes connected events to the account's church.
  - **Actions:** every `"use server"` action authenticates its own caller.

## Agent 2 — Routes & Pages

- **Finding (High):** a paid event registration at a church that can't take payments is saved as payment-pending, with no way to pay.
  - *Where:* `app/portal/actions.ts:396-414`; `app/app/member-actions.ts:655-673` and `:847-860`; `app/app/church-admin-actions.ts:1547-1561` and `:1654-1665`. `createEventRegistrationPaymentIntent` throws when there is no connected account, and every caller swallows it.
  - *Check:* **confirmed**, but **pre-existing**. The swallow-everything `catch` predates this branch, and before Connect a live paid registration had no card form either (Council Review 34's G3.0c finding). Connect makes it the normal case for an unconnected church.
- **Low:** `appBaseUrl()` null in the start route. The code already sends the admin to `?stripe=not_configured`, which is correct.
- **Verified correct:**
  - the start → Stripe → callback → settings loop;
  - every `?stripe=` value has a message;
  - all gates match the manifest;
  - member giving refuses cleanly with a notice when the church isn't connected;
  - the donor portal checks again before the card step.

## Agent 3 — UX & Shell

- **(Critical) The `?stripe=` result banner stays on refresh.** It comes from the query string, so a stale "connected · online giving is on" can sit beside a live status that has since changed.
  - *Check:* **confirmed**, but overstated. The live status badge is always correct; only the banner is stale. **Medium.**
- **(Critical) The new card is hard-coded English,** while `giving-admin-workspace.tsx:43` uses `useI18n()`.
  - *Check:* **confirmed**, but overstated. Most giving copy is English-only (S13, the owner's decision at Council Review 30). **Medium.**
- **(High) "ChurchCore … takes no fee" doesn't mention Stripe's own processing fees.**
  - *Check:* **confirmed.** It's accurate but incomplete.
- **(High) The disconnect confirmation should name the member impact.** This is a copy preference: the current text already says online giving and event payments stop.
- **(Medium) The badges rely on colour alone.**
  - *Check:* **wrong.** Each state has distinct text ("Not connected", "Connected · taking payments", "Connected · setup unfinished").
- **(Medium) The alerts lack `role="alert"`.**
  - *Check:* **wrong.** Mantine's `Alert` defaults to `role="alert"` (`@mantine/core/cjs/components/Alert/Alert.cjs:52`).
- **Low:**
  - *Margin at phone width (`m="md"`):* unverified at a phone width.
  - *Loading state on disconnect:* the confirm button already shows `loading`, and Keep connected is disabled. Minor.

## Agent 4 — Feature & Competitive

- **ADR 0025:** every statement is met by code. *Check:* agreed, after spot-checking each row.
- **Council Review 34's finding #5 (no Connect):** closed in the infrastructure. G3.0c (registration card form) and G3.1 (recurring) remain.
- **"All steps work end to end."**
  - *Check:* **unsupported.** Nothing has run against Stripe test mode with a real connected account. Every Stripe call is mocked or stubbed in tests, and CI has no Stripe keys. This is an inference stated as fact.
- **Pre-Connect rows with a null `stripe_account_id`:** "safe".
  - *Check:* agreed. Confirming or cancelling such a donation throws before calling Stripe. A refund falls back to the church's current account, so Stripe refuses an unknown PaymentIntent and no money moves.
- **G3.0 "merged `f9a054a`".**
  - *Check:* **wrong.** That was the branch commit; it merged as `13d0413` (#172).
- **Competitor matrix** (Tithe.ly "Standard" Stripe, Breeze "PaymentExpress", PayPal breadth).
  - *Check:* **unsupported.** No source is cited, and none is in the repo. This is a competitive claim made without the evidence that claim type needs (the same sub-pattern as Council Review 29).
- **Readiness 82/100.**
  - *Check:* a self-tallied +7 that rests partly on the unsupported end-to-end claim.
