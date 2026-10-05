# Council Review 43 — Agent reports (G5.1 Resend live)

This is a diff-scoped round: `feat/resend-live-g5-1` (`93e883c`) compared with `main`. Five separate read-only agents each received their verbatim `improve-software.md` prompt plus a scope preamble. Their reports are condensed below. The synthesis checks every claim against the source and lists the 7 that were wrong.

## Agent 1 — Data & API

**Verdict:** pass.
- Provider selection matches the brief, and one shared constant defines the retryable error codes.
- Receipt delivery is identical whether it runs live or through the re-send script (`deliverDonationReceipt`), and every write is checked.
- The script is safe to dry-run.
- **Suggestions:** prefix idempotency keys by kind (adopted into fix 1), validate email configuration on startup, and monitor stale claims.
- **Wrong:** it reviewed migrations that don't exist on this branch, and it passed the per-attempt retry key (synthesis #1–2).

## Agent 2 — Routes & Pages

**Verdict:** pass.
- Every shell link resolves.
- The Resend and SendGrid webhooks and the two communications crons are registered and tested.
- **Wrong:** "/app/member has no page" (synthesis #3).

## Agent 3 — UX & Shell

**Verdict:** ARIA, states, styling and errors are acceptable.
- **Pain points:**
  1. The history list doesn't show `error_code` or the provider.
  2. Retry is shown for permanent failures.
  3. Nothing shows which provider is active.
- Points 1 and 2 were confirmed and became fix 3. Point 3 maps to S12.

## Agent 4 — Feature & Plan

**Verdict:** RATIFIED; all 8 criteria met; Gap 5 closed on merge; readiness 88–89.
- **Wrong or unsupported** (synthesis #4–6):
  - Gap 5 closing on merge;
  - an invented npm command and a reused O-number;
  - unsourced claims about cost and competitors.

## Agent 5 — Security

**Verdict:** pass. Authorization, tenancy, RLS, webhooks, secrets and stub gating are all correct on every path.
- **Informational:** `send-email.ts` lacks `server-only` (confirmed; fix 2).
- **Wrong:** it treated the unchanged Svix verification as an unverified risk (synthesis #7).
- **Missed:** the duplicate-send risk in the per-attempt retry key, which the orchestrator found from Resend's docs (fix 1).
