# Council Review 16 — Synthesis

**Date:** 2026-09-23
**Branch audited:** `fix/comms-retry-dlq-copilot-findings` (commit `00c49bb`)
**Base branch:** `main` (`12873e6`)
**Scope:** Diff-scoped. This branch closes the five GitHub Copilot review findings left open on PR #143 (Council Review 12) in the communications retry cron / dead-letter queue.

## §0 Scope Note

This is a fresh single-commit branch cut from `main`, not accumulated history. It is small in files (3 source, 2 test, 3 docs) but changes the retry pipeline's behavior: when rows are written, what counts as terminal, and what gets dead-lettered. That puts it outside the small-isolated-fix exception in `improve-software.md` §0, so a full Council pass was run. It is diff-scoped, following the precedent of Reviews 13–15.

Provenance matters here. All five findings this branch fixes were raised by GitHub's automated Copilot review on PR #143, and **none was raised by Council Review 12**, which approved that PR. This is the second time GitHub's own review caught what a Council round missed (the first was the finance-import mapped-code bug on the Review 13 PR, #145).

## 1. Cross-Agent Consensus

- **All four agents recommend merging. There are no blockers**, and no agent found a regression introduced by this diff.
- **Agents 1 and 4** independently confirmed in source that all five claimed fixes are real (Agent 4's table in §1). Every column written exists, and every CHECK constraint is satisfied (Agent 1).
- **Agents 2, 3 and 4 independently found the same sibling bug outside the diff:** the per-row manual Retry (`retryCommunicationAction`, `app/app/communications-actions.ts:243`) still dispatches without `recordLog: false`, inserts a new row, and never updates the original. That is the same "one logical message, many eligible rows" fan-out this branch fixes for the cron, plus a possible duplicate delivery when the cron later re-sends the untouched original.
- **Agents 1, 2 and 3 independently found a pre-existing compliance bug:** in the cron, `findSuppression` (`send-with-suppression.ts:53`) and `checkOptIn` (`queue-communication.ts:272`) use the cookie-based `createTenantServerClient()`. The cron has no session, so both lookups run as anon against `to authenticated` RLS policies and return nothing. **Suppressed or unsubscribed email recipients would be re-sent**, and every SMS retry is treated as opted out. Agent 2 notes a *new* consequence: those SMS skips are now dead-lettered at exhaustion under a misleading `recipient_suppressed` code.
- **Agents 1, 3 and 4 independently confirmed the adapter-code gap** documented in the factory run (`sendgrid_<status>`/`twilio_<status>` never match the transient set). **Agent 4 found it is bigger than documented** (see §2).

## 2. Corrections and verifications during synthesis

Each agent claim below was checked against source before being included.

1. **Agent 4: "Resend is never used for sending." Verified true, and a significant new finding.** `resendAdapter` is imported only by `app/api/webhooks/resend/route.ts` and `lib/communications/resend-adapter.ts` itself. `queue-communication.ts` always sends email through `sendgridAdapter`, which falls back to a stub (`sendgrid-stub-…` ids, reported as accepted) when `SENDGRID_API_KEY` is unset. ADR 0006 says Resend is primary and is selected by `RESEND_API_KEY`. A deployment configured per the docs sends no real email. It follows that the factory-run doc's line "only the Resend adapter's `network_error` does [match]" is technically true but can never happen in practice. **Correction to the factory-run doc:** in production no path currently writes a transient `error_code`, so the retry cron and the operator retry button receive no production input at all. This branch fixes a pipeline that is currently switched off. That's why none of the in-branch behavior changes below can mis-deliver today, and also why the compliance bug in §1 is urgent the moment anyone fixes the adapter mapping.
2. **Agent 3: "If `markSent`'s update fails, the row is re-sent without limit." Verified, but not new.** `main`'s `markSent` also discarded its update result. Checking the update before sending (P2 below) closes it.
3. **Agent 3: "`error_message`/`last_error_message` store untruncated provider text, which may include recipient addresses." Verified, but not new exposure.** `writeLog` already stores the same untruncated text on the first send, and the DLQ is readable only by `can_manage_communications`. Truncating is still cheap hardening (P3).
4. **Agent 1: "The webhook log lookup uses the anon cookie client and may never match." Plausible, not verified in this round.** It is outside this diff. Logged as follow-up F4 to verify, not asserted as a defect.
5. **Agent 4: "`updateSourceRow` extends a local-fallback branch, against the Supabase-only mandate." Fair.** The local branch was kept only because every other helper in the file is still dual-path. P2 rewrites these helpers, so it should drop the local-fallback branch from the new helper.

Failure-mode note for the standing synthesis-scrutiny lesson: this round's agents did not overstate or invent anything we could find. The one inaccuracy was in our own factory-run doc, which understated the adapter gap (item 1).

## 3. ADR Assessment

**No new ADR needed for this branch.** It reuses the existing DLQ table, the RLS helpers, and the admin-client-for-cron pattern. **However, ADR 0006 (Email Provider Resend) no longer matches the code** (§2 item 1). Follow-up F2 must either implement ADR 0006 as written or amend it. That decision belongs to that branch, not this one.

## 4. Implementation Prompts

### In this branch (proposed; needs human approval)

- **P1: Manual retry uses the source-row path.** Export a single-row entry point from `lib/communications/retry-eligible.ts` (for example `retryCommunicationLog(logId, session)`) that loads the row, checks eligibility, dispatches with `recordLog: false`, and records the outcome on the original row, with the same DLQ rules. Rewire `retryCommunicationAction` to it while keeping its role gate and return shape. Tests: manual retry creates no new log row; it increments the original; a row a manual retry already sent is no longer cron-eligible.
- **P2: Claim the attempt before sending.** Increment `retry_count` / `last_retry_at` through the guarded update *before* dispatch, skip the row if the claim loses, then record the outcome with a second update guarded on the claimed count. This closes the double send between overlapping runs (Agent 1 #3) and the unbounded re-send after a failed `markSent` (Agent 3). Drop the local-fallback branch from the new helper (§2 item 5). Tests: a lost claim means no send; a failed final update still leaves the attempt consumed.
- **P3: Small hardening.**
  - Record opt-outs as `recipient_opted_out`, separately from `recipient_suppressed`. Use a skip code on the result, not string matching.
  - Truncate `error_message`/`last_error_message` to 500 characters.
  - Add `.eq("church_id", row.church_id)` to the source-row update guard.
  - Add tests for the Supabase `catch` branch and for `markSent` when the update matches no row.

### Follow-ups (separate branches, in this order)

- **F1 (P1 priority, compliance): the cron's suppression and consent lookups.** Run `findSuppression`/`checkOptIn` through the admin client (still scoped by `church_id`) when there is no user session. **This must land before F2.** Otherwise, fixing transient-code mapping would start re-sending to suppressed recipients.
- **F2 (P1 priority): provider wiring and transient-code mapping.** Implement Resend selection per ADR 0006, or amend the ADR. Map 429/5xx responses and thrown `fetch` errors to transient codes in all three adapters. Merge `TRANSIENT_ERROR_CODES` and `TRANSIENT_PROVIDER_ERROR_CODES` into one list.
- **F3: DLQ visibility.**
  - Report swallowed bookkeeping failures to Sentry.
  - Add a bookkeeping-failure count to `RetryEligibleResult` and use it to drive the cron's 207.
  - Explain the disabled Retry button with a tooltip / `aria-describedby`.
  - Add a minimal DLQ view.
- **F4: verify webhook log resolution under the anon client** (Agent 1 caveat, §2 item 4).

## 5. MVP Readiness

**68/100, unchanged** (Agent 4; within Review 15's 67–69 band). This branch fixes correctness on a path production can't reach yet. The newly surfaced gap, where the primary email provider isn't wired for sending, offsets any gain. Expect +1–2 once F1 and F2 ship.

## 6. Agent Reports

- [agent-1-database-api](2026-09-23-council-review-16-agent-1-database-api.md)
- [agent-2-route-page](2026-09-23-council-review-16-agent-2-route-page.md)
- [agent-3-ux-shell](2026-09-23-council-review-16-agent-3-ux-shell.md)
- [agent-4-feature-competitive](2026-09-23-council-review-16-agent-4-feature-competitive.md)

## §7 Execution & Documenter sign-off

The human approved P1, P2, and P3 as proposed in §4. All three were implemented in commit `4f2ce1c` (`fix: claim retries before send and route manual retry through the same path`): `retryCommunicationAction` now shares the cron's exported `attemptRetry()` (P1); the attempt is claimed via a guarded `retry_count` update before dispatch, and the new `updateSourceRow` helper dropped its local-fallback branch (P2); a `skipCode` field separates `recipient_opted_out` from `recipient_suppressed`, error text is truncated to 500 characters, and the source-row update guard gained a `church_id` check (P3).

Re-verified after `4f2ce1c` by the Documenter: `npx vitest run` — **1611/1611 passed, 134 files**. `npx tsc --noEmit` clean, `npm run lint` 0 errors / 7 pre-existing unrelated warnings, `npm run build` clean (all per the orchestrator's report; the vitest count was independently re-run by the Documenter, not taken on faith).

Follow-ups F1–F4 from §4 remain open, unstarted, in the stated order (F1 before F2). `DEVELOPMENT_PLAN.md`, `CHANGELOG.md`, `README.md`, the factory-run doc, and ADR 0006 have been updated to reflect P1–P3 and to record F1/F2 as open gaps.

**Documenter sign-off:** granted. P1–P3 are implemented, tested, and verified; the docs and ADR now match the code's actual state (including the corrected Resend-not-wired framing); F1–F4 are recorded as open follow-up work, not silently dropped.
