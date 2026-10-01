# Council Review 32 — Agents 1–4 (S6: server-side broadcast recipients, F6)

**Scope:** `fix/broadcast-recipients-server-s6`, commit `bbc34e2` vs `main`, diff-scoped. Four distinct `codebase-researcher` agents (read-only by tool access). The orchestrator checked the claims below against source.

## Agent 1 — Database & API

- **Verified:**
  - Recipients are resolved in the session's church only.
  - The role gate matches compose (pastor, church admin, secretary).
  - No other action takes a contact from the client and sends to it.
- **Overstated ("CRITICAL"):** `merged_into_profile_id` vs `merged_at`. The merge function sets both together (`supabase/migrations/20260930000000_*.sql:227-228`), and no local row has one without the other. Two spellings of one check: a tidy-up, not a defect.
- **Wrong:** "broadcast skips suppressions by design, so an admin can message a suppressed contact." Every send runs `sendWithSuppression`, which checks the suppression list and opt-in for that recipient. The comment it cited is about ids that don't resolve.

## Agent 2 — Routes & Pages

- **Verified:**
  - One caller.
  - The page and action gates match.
  - The manifest is accurate.
- **Verified, and the round's main finding:** `components/application/communications-hub.tsx` is rendered by no page. `/app/communications` redirects to `/history`, and history, compose and templates each use their own components. So:
  - **Hand-picked broadcast has no UI.** `broadcastMessageAction` is still a `"use server"` export callable by action id. That's why S6 still mattered: before it, the endpoint sent to any address given.
  - **The live app has no suppressions screen.** The list, "Add Suppression", and S1/Review 28's button gating all live in the orphaned hub. `getCommunicationSuppressions` has no caller.
  - **S11 (remove-suppression action) has nowhere to live** as written.

## Agent 3 — UX & Shell

- **Its findings are verified but moot:** the picker's unmarked contact-off and merged members, the unexplained "skipped" count, and badges without accessible names all describe the orphaned hub.
- **Wrong:** "a pastor could accidentally message someone who opted out." Opt-in and suppression are checked per send.

## Agent 4 — Feature & Competitive

- **Verified:**
  - Every item of S6's definition of done is met.
  - The compose and broadcast paths reach the same consent and suppression checks at send.
  - Readiness holds at 77.
- **Wrong:**
  - "F1 (cron anon compliance) is open and must precede F2." F1 was done in Council Review 17 (ADR 0022).
  - "S11 is ready to start": there's no suppressions UI to put it in.
