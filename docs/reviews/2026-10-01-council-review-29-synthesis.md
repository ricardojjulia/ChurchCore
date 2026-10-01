# Council Review 29 — Synthesis (S2: webhooks fail closed, with F4)

**Branch:** `fix/webhooks-fail-closed-s2` (`26db13c`) vs `main`.
**Format:** diff-scoped, four distinct read-only agents (`2026-10-01-council-review-29-agents-1-4.md`).

## Verdict

**S2 meets its definition of done.** All four webhooks reject requests while their secret is unset. Stripe has a 300-second replay window. SendGrid and Twilio verify the providers' real schemes; the old code used an invented HMAC scheme that would have rejected every real event once a secret was set. F4 is fixed: the webhook writes ran as anon and never saved; they now use the church-scoped admin client. e2e proves a signed Resend bounce and a signed Twilio 21610 each write their suppression. No agent found a defect in the diff.

## Wrong claims (5, all caught by reading source)

1. A1: "message ids can't collide across churches" was stated as fact. It is inferred; there is no unique constraint.
2. A2: the cron secret's name.
3. A2: "more than 999ms separation" between shards.
4. A4: "Twilio doesn't forward inbound STOP."
5. A4: "TCPA compliance is met" and "competitors do the same."

A1's "Stripe metadata church_id" finding was right about the code but overstated in severity (Medium → Low; see the agents file).

## Proposed follow-ups (owner decision)

| # | Item | Proposal |
|---|---|---|
| 1 | **O4: confirm the hosted webhook secrets and `NEXT_PUBLIC_APP_URL`** before this deploys. Without them, production webhooks reject everything (Stripe donations stop reconciling). | New owner action. |
| 2 | **Remove-suppression action** (church admin, audited, with a reason). Today only SQL undoes a suppression, and S2 makes suppressions real. | New tracker row, Must, sequenced **before G5.1** (no real bounce can arrive earlier). |
| 3 | **Operator visibility for missing provider and webhook config** (a readiness item, or a `/control` health check). | New tracker row, Should. |
| 4 | **Inbound STOP messages** (needs a sending-number → church mapping). Twilio already blocks delivery after STOP. | §0.5 deferred, after MVP. |
| 5 | Translate suppression reasons in the UI; add SendGrid registration and the fail-closed notes to the runbook. | Documenter (runbook); the reason labels are a small UI fix on this branch. |

## Readiness

75 → **76/100**: unsigned webhooks are closed, and suppressions are actually recorded. The larger lift waits for G5.1 (real sends) and S6.
