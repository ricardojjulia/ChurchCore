# Council Review 34 — Synthesis (G3.0: card form for online giving)

**Branch:** `feat/giving-card-form-g3-0` (`f9a054a`) vs `main`. Diff-scoped, four distinct read-only agents (`2026-10-02-council-review-34-agents-1-4.md`).

## Verdict

**G3.0's UI and flow meet the definition of done, but live mode can't work yet:** PaymentIntent creation sends a malformed `automatic_payment_methods` parameter (latent until now, and also in event registrations). The round also surfaced two larger, pre-existing gaps:
- no Stripe Connect: all churches' gifts go to one account;
- no card form for paid event registrations.

## Wrong or unfounded claims (4)

1. A1: "`abandoned` may be invalid."
2. A3: "the error isn't announced."
3. A4: "Apple/Google Pay work today."
4. A4: "readiness 78–79."

## Proposed (owner decision)

| # | Finding | Proposal |
|---|---|---|
| 1 | Malformed `automatic_payment_methods` (donations and event registrations). | Fix now. Donations: **card-only** (`payment_method_types[]=card`): cards, Apple Pay and Google Pay, all completing in-page, so no redirect return is needed. Event registrations: the same. |
| 2 | Confirm and cancel don't check the giver on non-anonymous gifts. | Fix now: require the session's profile when the gift has one. |
| 3 | No Back from the card step; webhook receipts lack the church name. | Fix now: a Back button that cancels the pending gift and returns to the form, and a church-name lookup in the webhook. |
| 4 | Paid event registrations have no card form. | New Must row (about 1 day), reusing the card step. |
| 5 | No Stripe Connect. | **Owner question:** one church per deploy (its own Stripe keys) for MVP, or build Connect (several days)? |
| 6 | English-only giving strings; phone drawer width (unverified). | Add to S13; check the drawer on a phone width during the UX pass. |

## Readiness

Holds at **77/100** until live payments can start (#1).
