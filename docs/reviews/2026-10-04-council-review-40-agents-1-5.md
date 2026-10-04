# Council Review 40 — Agent reports (G3.3 year-end giving statements)

Diff-scoped round on `feat/giving-statements-g3-3` (`60d912b`) vs `main`. There were five separate read-only agents, each given its verbatim `improve-software.md` prompt with a scope preamble. Each report is condensed below to its findings. The synthesis (`2026-10-04-council-review-40-synthesis.md`) checks every claim against source and lists the seven that proved wrong.

## Agent 1 — Data & API

**Verdict:** data integrity and concurrency are sound. The migration is safe.

- **The migration** (`20261005000000`):
  - It is additive and idempotent, with backwards-compatible status values (`communication_logs_status_check`, `20260528101500`).
  - Its rollback isn't stated in it. → *fix 3*
- **Claim-before-send** is race-safe:
  - the unique violation is handled;
  - the stale-claim update is guarded on `(id, church_id, status='sending')`;
  - a zero-row update is handled.
- **Error codes:** `statement_send_failed` and `statement_claim_stale` are not transient, so they are never retried.
- **Consent reads** fail closed.
- **Session ids** are used correctly: `sent_by` is the church profile id and `actorId` is the login id.
- **Gaps raised:**
  - no proactive cleanup cron for abandoned `sending` claims (accepted);
  - no live test of concurrent batches (index-enforced);
  - provider errors truncated to 300 characters (the existing pattern);
  - no assertion that the email body is non-empty (`email.ts` is tested on its own).
- **Wrong claim:** that consent skips happen after the claim (synthesis #5).

## Agent 2 — Routes & Pages

**Verdict:** all surfaces are wired and registered. No 404s or orphaned handlers.

- Both new GET routes exist, and their parameters match what the UI calls (`pdfHref`, the member year link).
- The two server actions are used by the panel, and both gate on church-admin.
- The manifest entries match the real gates.
- The Statements tab and the member card can be reached from the existing pages.
- **Wrong claim:** that only members can reach the member route (synthesis #6).

## Agent 3 — UX & Shell

**Verdict:** the work follows the shell patterns. Its errors use `role="alert"`, its tables scroll horizontally, and it adds no custom CSS.

- **Concerns raised:**
  - inline hex colours in the email HTML (accepted: email clients can't use the app's CSS variables);
  - no loading skeleton on the member page (it renders server-side);
  - table headers aren't sticky on mobile.
- **Wrong claims:** a crash on a failed years lookup (synthesis #3), and `sanitizeWinAnsi` having no tests (synthesis #4).

## Agent 4 — Feature & Competitive

**Verdict:** RATIFIED. All 33 acceptance criteria are met. Readiness 84–85.

- Role and tenant coverage is verified, and the e2e journey is complete.
- **Wrong or unsupported claims** (synthesis #7):
  - that staff screens show "Anonymous" rows (stale since the validator round);
  - that per-gift receipts moved to G3.3b;
  - a competitor table with no sourced facts;
  - that Gap 3 is closed on merge (it isn't, because of G3.3b).

## Agent 5 — Security

**Verdict:** authorization, tenancy and anonymous masking pass. No SECURITY DEFINER functions are in scope.

- **Verified:**
  - `maskForStaff` returns null for anonymous-only donors;
  - `namedView` is used for the admin PDF;
  - `p:` and `h:` references only;
  - no raw emails in idempotency keys or audit entries.
- **Findings:**
  1. Email header injection via the church name, rated High. → wrong as stated (synthesis #1), kept as defence in depth (*fix 2*).
  2. A stale-claim clock-skew window, rated Medium. → Low, plus a logged warning (*fix 5*).
  3. An unbounded range, rated Low. → *fix 4*.
- **Further claims:** untested idempotency and stale claims (wrong, synthesis #2), and member downloads not being audited (by design).
- **Not caught by any agent; found by the orchestrator while checking this report:** statement send records carry `recipient_id`, which the Communications history renders to pastors and secretaries (*fix 1*).
