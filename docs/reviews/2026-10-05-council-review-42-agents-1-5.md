# Council Review 42 — Agent reports (G3.3b registration receipt)

This is a diff-scoped round on `feat/registration-receipt-g3-3b` (`18ed864`) against `main`. Five separate read-only agents each received their verbatim `improve-software.md` prompt plus a scope preamble. Their reports are condensed below to their findings. The synthesis checks each claim against source and lists the six that proved wrong.

## Agent 1 — Data & API

**Verdict:** pass.

- The migration is additive, idempotent and nullable, and states its rollback.
- Claim, lease, send and mark follow the `donation-completion.ts` pattern.
- Stripe retries are safe. The registration and payment updates run before the receipt and are idempotent.
- Every query and write checks its error.

**Wrong claim:** that the `sendEmail` idempotency key makes retries safe (synthesis #1).

## Agent 2 — Routes & Pages

**Verdict:** pass.

- The webhook's manifest entry lists `registration-receipt.test.ts`.
- The email has no links.
- Public and member registration both create a PaymentIntent that reaches the webhook's receipt call.

**Wrong claim:** that the receipt is covered end to end (synthesis #2).

## Agent 3 — UX & Shell

**Verdict:** the content is clear. The not-deductible line, church-local time, fallbacks and escaping are all in place.

**Raised:**
- A possible double receipt alongside Stripe's. Accepted, because donations behave the same way.
- English only. Accepted, because donation receipts are too (S13).
- Unsent receipts are invisible to operators (S12).

**Wrong claims:** that the subject needs escaping, and that `#666` fails contrast (synthesis #3–4).

## Agent 4 — Feature & Plan

**Verdict:** all acceptance criteria are met. Readiness goes to 86, and it recommends a journey test.

**Wrong claims:** that G3.3 hasn't merged, plus inconsistent slack figures and the idempotency-key claim (synthesis #1, #5–6).

The orchestrator then found, while checking this report, that Gap 3's definition of done requires a "change" step in the recurring journey that doesn't exist (*fix 2*).

## Agent 5 — Security

**Verdict:** authorization, tenancy, RLS, HTML escaping, signature verification, idempotency and recipient source all pass.

**Critical:** `sendEmail()` returns a fake success with no key in production (`lib/notifications/send-email.ts:36-43`). This was confirmed (*fix 1*). It predates the branch and affects donation receipts too.

**Notes:**
- Transactional receipts skip suppressions. Consistent with donations; accepted.
- 5xx on any error. Intentional.
- No event-id table. Mitigated by the claims.
