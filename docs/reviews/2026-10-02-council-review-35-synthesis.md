# Council Review 35 — Synthesis (G3.0b: Stripe Connect)

**Branch:** `feat/stripe-connect-g3-0b` (`f45b7e8`) vs `main`. Diff-scoped, four distinct read-only agents (`2026-10-02-council-review-35-agents-1-4.md`).

## Verdict

**G3.0b meets ADR 0025.** Every live Stripe call runs on the church's own connected account, and the platform account is never used as a fallback. OAuth is bound to the church and the admin. The table can't be written from a client. Connected webhooks are scoped to the account's church.

- **No tenant-boundary or payment-routing defect was found.**
- **One real, pre-existing flow bug** became more visible: a paid event registration at a church that can't take payments.
- **Two UX fixes** are proposed.

**Before announcing live giving, the platform needs** its Stripe setup and one Stripe test-mode run with a real connected account. No test so far exercises real Stripe.

## Found by the orchestrator while building (fixed on the branch)

- **`stripeRequest` misread Connect OAuth errors.** OAuth returns `{ error: "invalid_client", error_description }`, a flat shape, so every OAuth failure became "Stripe 401". Disconnecting an account the church had already revoked at Stripe could therefore never succeed.
- **The tolerated-error match was too broad.** `/invalid/` would have marked a church disconnected on "Invalid API Key", while Stripe still had the church connected. It now matches only Stripe's "is not connected to stripe account" error.
- **Disconnect had no confirmation.** A single click turned off online giving; it now asks first.

## Wrong or unsupported agent claims (6)

1. **A3:** "the badges are colour-only." Each has distinct text.
2. **A3:** "the alerts lack `role="alert"`." Mantine's default is `role="alert"`.
3. **A4:** "all steps work end to end." Nothing ran against real Stripe.
4. **A4:** the competitor matrix. No evidence.
5. **A4:** "G3.0 merged as `f9a054a`." It merged as `13d0413`.
6. **A1:** "Critical" for a dead-code branch. It's Low.

## Proposed (owner decision)

| # | Finding | Proposal |
|---|---|---|
| 1 | A paid event registration at a church that can't take payments is saved as payment-pending with no way to pay. This is pre-existing: every caller swallows the Stripe error. | **Fold into G3.0c**, which reworks these same five call sites to add the card form. There, refuse a paid registration with a clear message when the church can't take payments, and stop swallowing Stripe errors. Merging G3.0b alone leaves production no worse than today, since there is still no registration card form. |
| 2 | The `?stripe=` result banner stays on refresh. | **Fix now:** drop the parameter from the URL once the banner has been shown. |
| 3 | The fee copy omits Stripe's processing fees. | **Fix now:** "ChurchCore takes no fee; Stripe's standard processing fees apply." |
| 4 | The Connect card is English-only. | **Add to S13** with the rest of the giving copy (consistent with Council Review 30). |
| 5 | The dead local-SQL refund branch doesn't pass the account. | No action. It's dead code under the Supabase-only mandate. |
| 6 | Platform Stripe setup, plus one test-mode run with a real connected account. | **New owner action O7.** Live giving isn't announced until it passes. |

## Readiness

**79/100** (from 77). Connect removes the blocker that made live payments unsafe across churches. The score stays below Agent 4's 82: G3.0c and G3.1 are still open, and no live path has run against real Stripe yet (O7).
