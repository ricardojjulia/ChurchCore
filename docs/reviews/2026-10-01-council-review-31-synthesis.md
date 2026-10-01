# Council Review 31 — Synthesis (S4: crons and demo routes fail closed, F8)

**Branch:** `fix/crons-demo-fail-closed-s4` (`f9d8397`, `5758771`) vs `main`. Diff-scoped, four distinct read-only agents (`2026-10-01-council-review-31-agents-1-4.md`).

## Verdict

**S4 meets its definition of done.**
- Crons reject requests without `CRON_SECRET` everywhere but `next dev`.
- Demo routes are 403 outside demo mode, and in demo mode complete only pending stub payments.

**S4 also found and fixed two real bugs:**
- a Stripe-paid event registration never became "paid";
- every demo-mode profile save failed.

**It added a CI check** that every Supabase read and write names real columns.

## Wrong or unsupported claims (5)

1. A1: "local paths write emergency contacts to `profiles`."
2. A2: "`*/5` breaks deploys"; Vercel PR deploys pass.
3. A3: "lint passes"; the agent can't run it.
4. A3: "blocks real charges."
5. A4: "no real church affected"; inferred.

## Proposed (owner decision)

| # | Finding | Proposal |
|---|---|---|
| 1 | **The Stripe webhook isn't retry-safe.** It returns 200 on handler errors, so Stripe never retries; and the donation path's `pending → succeeded` flip comes first, so a later failure (ledger post, receipt) is never retried even on a 5xx. | **Fold into G3.2** (installments from Stripe webhooks rework this route): 5xx on failure, every step repeatable, the completion marker written last, a retry e2e. About +0.5 day on G3.2. |
| 2 | Two finance-import writes ignore their errors (a partial import reports completed). | Fix on this branch: check both. |
| 3 | Writes whose errors are ignored are a pattern (both S4 bugs hid this way). | New Should row: sweep Supabase writes whose `error` is never read; consider a lint rule. |
| 4 | Whether the hosted deploy runs with demo mode on, which permits provider stubs. | **Owner question.** Production-deployment docs to require it off for a real church. |
| 5 | Payment-status labels are English-only. | Add to S13. |

## Readiness

76 → **77/100**: event-registration payments through Stripe now actually record, and a CI guard catches the bug class.
