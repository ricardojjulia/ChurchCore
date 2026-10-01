# Council Review 33 — Agents 1–4 (S10: public event registration, server-side)

**Scope:** `fix/public-registration-server-s10`, commit `47e6e8d` vs `main`, diff-scoped. Four distinct `codebase-researcher` agents (read-only by tool access). The orchestrator checked the claims below against source.

## Agent 1 — Database & API

- **Verified:** the submit action's trust boundary holds. Every read and write is scoped to `(church_id, event_id)`, and a non-public or closed event matches no settings row. No direct client writes to the registration tables remain.
- **Verified, Medium:** `event_registration_payments_read_member` (`belongs_to_church`) lets any member read every registration payment in their church (amounts, payment intent ids). The orchestrator found no member-facing reader: all readers are staff, the webhook, the demo route or the server.
- **Verified, Medium:** `account_requests` keeps an anon INSERT policy (`status = 'pending'`) beside the `submit_account_request` RPC. The RPC is `SECURITY DEFINER` and anon-executable, so the policy is unneeded, and it lets anyone write pending requests for any church while skipping the RPC's checks. The orchestrator read the RPC: it validates the church, email and names, refuses an existing active account, and takes no actor argument (ADR 0024 does not apply).
- **Low, noted:**
  - a capacity race at capacity−1;
  - the rate limiter is per-instance memory, which slows abuse but doesn't stop it on serverless.

## Agent 2 — Routes & Pages

- **Verified:**
  - no regressions;
  - the member registration path (admin client, S8) and the staff workspace (`event_registrations_manage`) still work;
  - every other public page reads through an RPC or a token gate.
- **Wrong:**
  - "the church list via the admin client": it's the `list_portal_churches` RPC;
  - "the church-scoped admin client respects the policy": the admin client bypasses RLS;
  - "27 test cases": the action has 11.

## Agent 3 — UX & Shell

- **Verified, and fixed on this branch:** checkbox custom fields render as plain Buttons (`public-event-registration-panel.tsx:391`), with no checkbox role and no required marker. Following that led the orchestrator to a server bug: an unchecked required checkbox (`false`) passed the required check. Fixed, with a test.
- **Verified:**
  - event times use the visitor's browser zone (`toLocaleString()`, line 230) with no label;
  - the page title and every panel string are hard-coded English.

## Agent 4 — Feature & Competitive

- **Verified:**
  - S10 meets every item of its definition of done;
  - the safety track (S1–S6, S9, S10) is complete with S10, so M2 is met once it merges;
  - readiness holds at 77.
- **Wrong:**
  - "S6 pending a PR": merged as #169;
  - "Gap 1 closed Oct 2": Sep 30;
  - "S11+ are Should rows": S11 is Must.
- **Overstated:** "the rate limit prevents spam."
