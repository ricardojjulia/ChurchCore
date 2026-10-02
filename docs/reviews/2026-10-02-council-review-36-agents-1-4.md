# Council Review 36 — Agent reports (G3.0c: card form for paid event registrations)

**Branch:** `feat/event-registration-card-form-g3-0c` (`e7c0b59`) vs `main` (`d51f312`). Diff-scoped. Four distinct read-only `codebase-researcher` agents, run in parallel. Each report is condensed below, with the orchestrator's check of each claim against source.

## Agent 1 — Database & API

- **(Critical) The public cancel action doesn't pass a `churchId`, so it "violates ADR 0022".**
  - *Check:* **wrong.** The visitor is signed out, so the only proof is holding both the registration id and its PaymentIntent id, which only the registrant's browser was given. The old panel printed the PaymentIntent id on screen, and this branch removed it.
  - A `churchId` from the browser would be caller-supplied, so it adds no security.
  - Every write is already scoped to the church on the matched row (`lib/event-registration-payment.ts`, `row.church_id`).
- **(High) A PaymentIntent can be orphaned when the payment row fails.**
  - *Check:* **real, Low.** The PaymentIntent was never confirmed, so it can't charge anyone, but it was left open at Stripe.
  - **Fixed:** the PaymentIntent is now cancelled, best effort, before throwing.
- **Verified correct:**
  - `cancelled` is valid for both `event_registrations.status` and `event_registration_payments.status`;
  - the readiness gate runs before any write;
  - cancelling requires a pending, uncancelled registration;
  - the member cancel is scoped to the session's church, and the admin gate is right;
  - `stripe_account_id` is recorded on the payment row.

## Agent 2 — Routes & Pages

- **No blockers.** Agent 2 checked all of the following:
  - the public portal page is signed-out, and the member panel shows only to members;
  - `churchId` is passed correctly to both panels;
  - the admin gate matches `/app/church-admin/events/[id]` (church admin, pastor);
  - all ten paid-registration outcomes have a defined result;
  - no leftover "Secure payment ready" references remain.
- **Gaps:**
  - No member paid-registration e2e. The paths are covered at unit/Supabase level, and the public paid path is covered e2e.
  - "The secretary role isn't tested as denied." *Check:* **wrong.** The admin test loops over member, secretary and ministry-leader.

## Agent 3 — UX & Shell

- **(Critical) Closing the dialog silently cancels the unpaid registration.**
  - *Check:* real but overstated.
  - **Fixed:** the payment step now says up front that closing the window, or choosing Cancel registration, cancels the registration without charge.
- **(Critical) "Cancel" on the card step is ambiguous.**
  - *Check:* real.
  - **Fixed:** a registration's card step now says "Cancel registration".
- **(Critical) The payment step has no heading.**
  - *Check:* real.
  - **Fixed:** an `h3`.
- **(High) No focus management when the form is swapped for the payment step.**
  - *Check:* real.
  - **Fixed:** the new heading takes focus, and a test asserts it.
- **(High) Strings are hard-coded English.**
  - *Check:* true. This goes to S13 with the giving strings (owner decision, Council Review 30/35).
- **(High) `size="lg"` modal is "not responsive".**
  - *Check:* **wrong.** Mantine's modal content has `max-width: 100%` (`@mantine/core/styles/Modal.css:39`), so it shrinks on phones.
- **Verified correct:**
  - alerts default to `role="alert"`, and this time the agent checked `node_modules` before saying so;
  - currency formatting;
  - the admin "payment due" message.

## Agent 4 — Feature & Competitive

- **Definition of done:** "mostly met".
  - The card form is reused on connected accounts.
  - The declined-card path is tested on the card step, not again through the panels.
  - The public and member paths refuse when the church can't take payments.
  - The admin path doesn't refuse.
- **Admin-path departure.** This needs explicit owner confirmation; the orchestrator agrees and raises it as Proposal 1.
  - *Supporting claim, "the old admin path never created a PaymentIntent":* **wrong.** `main` at `app/app/church-admin-actions.ts:1652-1665` created one and discarded its client secret. The conclusion (never payable) is right; the evidence is wrong.
- **What marks a registration paid:** the webhook, as with gifts. The registrant can see "Payment received" before the admin's view updates.
- **Receipts for registrations are "not built".**
  - *Check:* half-right. ChurchCore sends none, but the PaymentIntent sets `receipt_email`, so Stripe can email its own receipt from the church's account.
- **Competitor features** (Planning Center pay-later, deposits, group pricing).
  - *Check:* **unsupported.** No evidence is cited; this is the same pattern as Council Reviews 29 and 35.
- **Readiness:** 79–80.
