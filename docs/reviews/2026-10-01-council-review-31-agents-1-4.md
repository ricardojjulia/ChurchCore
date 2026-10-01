# Council Review 31 — Agents 1–4 (S4: crons and demo routes fail closed)

**Scope:** `fix/crons-demo-fail-closed-s4`, commits `f9d8397` and `5758771` vs `main`, diff-scoped. Four distinct `codebase-researcher` agents (read-only by tool access). The orchestrator checked the claims below against source.

## Agent 1 — Database & API

- **Verified:**
  - `lib/cron-auth.ts` compares in constant time, and the `next dev` exception never applies on Vercel (it builds with `NODE_ENV=production`).
  - The demo route is stub-only.
  - The column-reference check is live.
- **Verified, and the most important finding of the round: the Stripe webhook returns 200 when a handler throws** (the route's `catch`), so Stripe never retries, and a transient database error loses the update.
  - The orchestrator found it goes deeper than the agent said. "Return 5xx so Stripe retries" isn't safe alone: the donation path flips `pending → succeeded` first, and on retry it finds nothing pending and returns. So a failed ledger post or receipt after the flip would never be retried either.
  - The fix is S2's pattern: every step repeatable, with the completion marker written last.
- **Verified:** the column check skips writes built from a variable (`.update(patch)`). The orchestrator checked the three it named in `app/app/finance-actions.ts`: their columns are all real. But two of them (`finance_journal_lines` insert and `finance_imports` update, lines ~472–473) ignore their errors, so a failed import can stop halfway yet report completed.
- **Wrong:** "the local-DB path writes emergency contacts to `profiles`." It writes `profile_sensitive_fields` (`app/app/actions.ts:547`), and every local path is dead code (`shouldUseLocalTenantFallback()` returns false).
- **Low:** the demo route's two-step update isn't transactional. It is demo-only.

## Agent 2 — Routes & Pages

- **Verified:** after S2–S4, every machine-called route fails closed:
  - crons need the secret;
  - demo routes need demo mode;
  - unsubscribe needs an HMAC;
  - webhooks need a signature.

  The manifest entries are accurate.
- **Unsupported:** "`*/5` cron breaks Vercel Hobby deploys." That was a blocker on the first demo deploy (memory), but every PR's Vercel deployment check passes with this `vercel.json`, so it isn't breaking deploys now. Which Vercel plan is in use is unknown from the repo.
- **Agreed, as an owner question:** whether the hosted deploy runs with `NEXT_PUBLIC_DEMO_MODE=true`. In demo mode `stubsAllowed()` permits provider stubs (fake "succeeded" payments and sends), and the demo routes open.

## Agent 3 — UX & Shell

- **Verified:**
  - The demo payment error is recoverable (the checkout stays open).
  - Demo profile saves now work, and the form reads emergency contacts back from `profile_sensitive_fields`.
  - Payment-status labels in `church-admin-event-workspace.tsx` (`formatPaymentStatus`) are hard-coded English. That belongs under S13.
- **Wrong:**
  - "`npm run lint` passes": the agent can't run commands.
  - "Blocks accidental real-Stripe charges": no charge is involved; the fix stops an unpaid registration from being marked paid.

## Agent 4 — Feature & Competitive

- **Verified:**
  - Every item of S4's definition of done is met.
  - G3.0–G3.3 don't use event-registration payment state.
  - Donation writes use real columns.
- **Raised for the owner:** demo mode on the hosted deploy. Its recommendation: production-deployment docs should require `NEXT_PUBLIC_DEMO_MODE` off for a real church.
- **Inferred, not verified:** "no real church was affected." Nothing in the repo shows paid registrations reached production, but nothing rules it out.
