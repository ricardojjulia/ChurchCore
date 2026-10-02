# Council Review 36 — Synthesis (G3.0c: card form for paid event registrations)

**Branch:** `feat/event-registration-card-form-g3-0c` (`e7c0b59`, plus the Council fixes) vs `main`. Diff-scoped, four distinct read-only agents (`2026-10-02-council-review-36-agents-1-4.md`).

## Verdict

**G3.0c meets its row.**

- **Card form:** a paid registration from the public portal or a member gets Stripe's card form, on the church's own connected account (ADR 0025). The old "Secure payment ready" panel had no way to pay.
- **Refusals:** at a church that can't take payments, a paid registration is refused before anything is written.
- **Errors:** Stripe errors are no longer swallowed, and a failure to start the payment removes the registration.
- **Leaving:** leaving without paying cancels the PaymentIntent, then the registration.
- **Agents:** no agent found a security or tenant defect.
- **UX:** four real accessibility and copy findings are fixed on the branch.
- **Not yet run against real Stripe:** same as G3.0b, tracked as O7.

## Built differently from the plan's wording (owner confirmation needed)

- **The admin "add registrant" path doesn't refuse.**
  - Before this branch, it created a PaymentIntent and discarded the client secret, so nobody could ever pay it.
  - An admin adding a walk-in doesn't take a card for them. Refusing would block recording a walk-in at an unconnected church.
  - Instead it creates no PaymentIntent, records the payment as due, and tells the admin to collect it in person.
- **Two of the five call sites in the row are dead local-SQL branches** (`shouldUseLocalTenantFallback()` always returns `false`). They're left untouched, under the Supabase-only mandate.

## Found by the orchestrator while building (fixed)

- **`registerForEventAction`, a `"use server"` export, had no session or role check.** RLS (`can_manage_church`) was its only gate. It now has the event page's gate: church admin or pastor, in the session's own church.

## Fixed after Council

- **Up-front cancel warning.** The payment step says up front that closing the window, or choosing Cancel registration, cancels the registration, and that the registrant won't be charged.
- **Cancel label.** A registration's card step says "Cancel registration".
- **Heading and focus.** The payment step has a heading, which takes focus when it replaces the form.
- **Orphaned PaymentIntent.** If the payment row fails after the PaymentIntent was created, the PaymentIntent is cancelled at Stripe.

## Wrong or unsupported agent claims (6)

1. **A1:** "Critical tenant violation" in the public cancel action. The proof is the id pair, and writes are scoped to the matched row's church.
2. **A2:** "the secretary role isn't tested as denied." It is.
3. **A3:** "the `size="lg"` modal isn't responsive." Mantine's `max-width: 100%` makes it shrink.
4. **A4:** "the old admin path never created a PaymentIntent." It did, and discarded the client secret.
5. **A4:** "registration receipts not built." Half-right: Stripe's `receipt_email` is set on the PaymentIntent.
6. **A4:** competitor feature claims, with no evidence.

## Proposed (owner decision)

| # | Finding | Proposal |
|---|---|---|
| 1 | The admin path records the payment as due instead of refusing. | **Confirm** the behavior as built: an admin can always add a walk-in, and the admin is told the payment is due in person. |
| 2 | A registrant who closes the payment step loses the registration and must start over. There is no "pay later" or resume link. | **New Should row:** resume an unpaid registration from its confirmation email (about 1 day), after MVP Must work. |
| 3 | ChurchCore sends no receipt for a paid registration; only Stripe's own receipt, if the church enables it. | **Add to G3.3** (receipts and statements), which already owns receipts. |
| 4 | Registration strings are English-only. | **Add to S13**, with the giving strings. |

## Readiness

**80/100** (from 79). Paid events can now actually be paid for. It is not higher because nothing has run against real Stripe yet (O7), and G3.1 (recurring giving) and G3.2 are still open.
