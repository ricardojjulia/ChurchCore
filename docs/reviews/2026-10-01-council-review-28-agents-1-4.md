# Council Review 28 — Agents 1–4 (re-run as four distinct audits)

**Why a re-run:** the first pass (`2026-10-01-council-review-28-combined.md`) was one agent covering all four lenses. GitHub's PR #165 review correctly noted that `AGENTS.md` and `improve-software.md` §0 require four distinct read-only audit agents. These four ran on the branch after the PR-review fixes (`bd975a2`), diff-scoped, as `codebase-researcher` agents (Read/Grep/Glob only, so no file writes were possible). Each claim below was checked by the orchestrator against source; corrections are marked.

## Agent 1 — Database & API

- Every writer of `communication_logs`, `communication_delivery_events` and `communication_suppressions` was enumerated. All of them use the church-scoped admin client:
  - queue, send-with-suppression, compose, cancel, suppress and unsubscribe;
  - the retry and scheduled crons.
- **The one exception is `lib/communications/webhook-events.ts`**, which uses the request client.
- **Reported "Critical, do not merge": the webhook handler's inserts and updates will fail.**
  - **Corrected severity:** the failure is real but not a regression. A webhook carries no session, so the request client is `anon`, and `anon` never had an insert or update policy on these tables. The writes failed before this branch too. This is the known F4 item.
  - **Deliberately not fixed here:** switching to the admin client while webhooks still accept unsigned requests when their secret is unset would let anyone forge suppressions or delivery events. S2 bundles fail-closed signature checks with F4 for exactly this reason.
- The cron claim and the cancel status guard are verified sound. Reads are correctly gated. The absence of an UPDATE policy is intentional (now stated in the migration header).

## Agent 2 — Routes & Pages

- **Pass.**
  - All `/app/communications/*` pages admit pastor, church admin and secretary, and the manifest matches.
  - `/hq` denies a church admin (`app/hq/layout.tsx`).
  - nora is seeded correctly.
- The nav link to Communications is shown only to church admins (`portal-workspace`). Pastor and secretary reach the pages by direct link. The agent judged this intentional; noted, not changed.
- The deferred care-queue item is reconfirmed.

## Agent 3 — UX & Shell

- **The cancel UX is verified:** the lost-race error is shown in an Alert, and success refreshes the list.
- **Verified and fixed:** the "Add Suppression" button (`components/application/communications-hub.tsx`) was not role-gated. A secretary or pastor could open the form and always get "Only church administrators may suppress contacts." It is now shown to church admins only, matching the action. New `components/application/communications-hub.test.tsx` fails without the fix.
- **Corrected claim (wrong):** "Cancel and Retry buttons have no accessible name (icon only)." Both have visible text labels ("Cancel", "Retry") with a decorative `leftSection` icon (`communications-history-workspace.tsx`). No `aria-label` is needed.
- **Follow-up (not S1):** there's no confirm dialog before cancelling a message or adding a suppression.
- **Pre-migration zeros:** until migration `20261001000000` reaches the hosted DB, a secretary's analytics show zeros. That's expected; it's the post-merge push.

## Agent 4 — Feature & Competitive

- **S1's definition of done:** every item is Done.
- **Readiness:** 74 → 75 is justified, but only +1, because delivery still waits on S2, S6 and G5.1 (Resend).
- **Verified, for the Documenter:** `docs/security-role-access-matrix.md`'s communications retry/suppression row conflates two different gates:
  - RLS reads: secretaries can now read;
  - action gates: suppress is church-admin only, while retry admits secretaries.
- **Corrected claims (wrong):**
  - "PR #165 hasn't opened yet": it was open, with CI green.
  - "67 DB tests validate the RLS boundaries": 67 is the whole DB suite; this file has 9.
