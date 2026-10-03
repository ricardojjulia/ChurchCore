# Council Review 38 — Agent reports (G3.1 + G3.2: recurring giving, installments, retry-safe webhook, real public gifts)

**Branch:** `feat/recurring-giving-g3-1-g3-2` vs `main` (`a0af8a3`). Diff-scoped. Four distinct read-only `codebase-researcher` agents, run in parallel. Each report is condensed below, with the orchestrator's check of each claim against source.

## Agent 1 — Database & API

- **No Critical defects.**
- **(High, UNVERIFIED) Stripe returns `pending_setup_intent` for a trialing `default_incomplete` subscription.**
  - *Check:* the agent marked it UNVERIFIED itself, which is correct; only a real Stripe run can prove it. It's tracked in O7.
- **(Medium) The orphan-journal cleanup relies on manual posts using `journal_type: "general"`.**
  - *Check:* true (`app/app/giving-actions.ts`).
  - *Fixed:* a comment now states the contract.
- **Verified:**
  - the concurrent receipt claim (a single-row update, so one wins);
  - the public cancel's proof by the id pair;
  - anonymous installments are unlinked from the giver;
  - the disconnected-account guard;
  - the `stripe_invoice_id` unique index;
  - RLS.

## Agent 2 — Routes & Pages

- **(Critical) The member recurring actions have no role check.**
  - *Check:* **overstated.** They act only on the caller's own profile in their own church, as the existing one-time gift actions (`donations-actions.ts`) do. There's no escalation.
- **(High) The manifest should mark the public actions as public.**
  - *Check:* **wrong.** Action entries have no such field; the module is registered with its tests.
- **(High) The security matrix has no rows for recurring gifts.**
  - *Check:* real. It's Documenter work.
- **(Medium) "A receipt is on its way" fires before the webhook sends it.**
  - *Check:* real, though minor.
  - *Fixed:* now "will follow shortly".
- **Verified:** the data loading is role-scoped, and the actions take the church and profile from the session.

## Agent 3 — UX & Shell

- **(High) Hard-coded teal in the public page's demo block "violates the design system".**
  - *Check:* **wrong.** ADR 0026 keeps teal as the secondary accent, and the block is pre-existing and within its file's allowance.
- **(Medium) Receipt copy.** Fixed; see above.
- **(Medium) The admin tab label isn't in i18n.**
  - *Check:* real.
  - *Fixed:* en, es and es-PR.
- **(Medium) The demo card numbers sit "above the real Stripe form".**
  - *Check:* **wrong.** Demo payments are stubbed, so no Stripe form renders. The block is pre-existing.
- **(Medium) The start date's time zone isn't stated.**
  - *Fixed.*
- **(Lower) A member with no email isn't warned.**
  - *Check:* **wrong.** Starting a recurring gift requires an email and says so.
- **(Lower) Focus doesn't move when the drawer swaps to the card step.**
  - *Fixed.*

## Agent 4 — Feature & Competitive

- **Definition of done:** G3.1 met. G3.2 met except "a retry e2e: unit only".
  - *Check:* real.
  - *Fixed:* an e2e now drives the real webhook route and database through a resumed, half-finished installment and a repeated delivery.
- **Risks:**
  - "*The SetupIntent is confirmed before the subscription exists; abandoning means no subscription is created.*" *Check:* **wrong.** The subscription is created first, and leaving the card step cancels it at Stripe.
  - The underlying concern held at two edges:
    - a failure after the subscription was created left it open at Stripe;
    - a trialing subscription with no card would have synced to "active", and its failed invoice would have emailed the donor.
  - *Fixed:* both.
- **Missing for a real church:**
  - updating the card on file for a recurring gift;
  - an admin creating a gift on someone's behalf;
  - G3.3 statements;
  - ACH;
  - donor-covered fees.
- **Readiness:** 81–82.
