# Factory run — Communications retry/DLQ fixes from Copilot review of PR #143

- **Date:** 2026-09-23
- **Branch:** `fix/comms-retry-dlq-copilot-findings`
- **Trigger:** A sweep of GitHub Copilot review comments across recent PRs (#142–#147). Five findings on PR #143 (Council Review 12, webhook DLQ) were still unaddressed on `main`. Council Review 12 approved that PR without raising any of them.

## Intent

Make the communications retry cron enforce its own contract: one logical message, at most 3 retry attempts, and exactly one `communication_dlq` record when it becomes terminal — never a false one.

## Findings and resolution

| # | Copilot finding (PR #143) | Status on `main` before | Resolution |
|---|---|---|---|
| 1 | A failed retry inserts a new failed, retry-eligible `communication_logs` row, so one message can fan out into several | Confirmed (`queue-communication.ts` `writeLog` inserts `status='failed'`, transient `error_code`, `retry_count = n+1`) | `queueCommunicationAction` gains `recordLog?: boolean`; the retry cron passes `false` and records the outcome on the source row. On success, the source row gets the attempt's `provider` / `provider_message_id` / `external_id` because delivery webhooks (`webhook-events.ts`) match on them. |
| 2 | Supabase update result is discarded, so a DLQ entry is written even when the source update failed | Confirmed | New `updateSourceRow` helper: guarded on `retry_count = <selected value>` (optimistic concurrency), returns whether a row was updated, never throws. The DLQ is written only when it returns true. |
| 3 | `incrementRetryCountOnly` can exhaust the budget without writing to the DLQ | Confirmed | Replaced by `consumeAttemptWithoutSend`, which dead-letters at exhaustion with `recipient_missing` / `recipient_suppressed`. |
| 4 | DLQ `last_error_code` and `last_error_message` are both filled from the provider message | Confirmed; the source row's `error_code` also got the message, which dropped it out of the transient set after one retry | `QueueCommunicationResult` now returns `errorCode` separately; the code and message go to their own columns on both the source row and the DLQ entry. |
| 5 | The DLQ tests only exercise the local-fallback path, which production never runs | Confirmed | Supabase-path terminal-state tests added (see Verification). |
| — | #145: README note for the error boundaries | Already done on `main` (`README.md` → Architecture Notes). No change needed. | — |

Design choice for #1: Copilot offered two options, either "dispatch without creating another eligible log" or "link and consume the attempt on the original row". We chose the first. It adds no schema change, and the source row already has every field the attempt needs. The cost is that individual attempts no longer get their own audit rows; the source row keeps the latest outcome plus `retry_count` / `last_retry_at`.

Behavior change beyond the literal findings: a retry that fails with a **non-transient** code is now dead-lettered immediately. The eligible query would never select it again, so it is already terminal, and before this change it disappeared without a DLQ record.

## Architecture impact

- No schema change. No new dependency. No ADR needed, because this only corrects an existing pipeline.
- `queueCommunicationAction` / `sendWithSuppression` gain an optional `recordLog` flag, which defaults to the old behavior. `QueueCommunicationResult` gains the optional `provider` and `errorCode` fields. Other callers are unaffected.

## Verification

- `npx vitest run`: **1611/1611 passed**, 134 files (updated from 1610/1610 after Council Review 16's P1–P3 commit `4f2ce1c`; retry-eligible.test.ts rewritten around the shared `attemptRetry()` path plus new coverage for the throw path and a failed outcome write; communications-actions.test.ts extended for the manual-retry outcome mapping).
- `npx tsc --noEmit`: clean.
- `npm run lint`: 0 errors, 7 pre-existing unrelated warnings (unchanged baseline).
- `npm run build`: clean.

## Council Review 16 and P1–P3

Council Review 16 (`docs/reviews/2026-09-23-council-review-16-synthesis.md`, diff-scoped against commit `00c49bb`) approved this branch 4/4 with no blockers, then proposed three implementation prompts which the human approved in-branch. All three landed in commit `4f2ce1c`:

- **P1 — manual retry uses the shared path.** `retryCommunicationAction` (`app/app/communications-actions.ts`) previously dispatched straight through `sendWithSuppression`, independently reproducing the same fan-out bug this branch's first commit fixed for the cron — plus a risk the cron would later re-send the untouched original row. It now calls the newly-exported `attemptRetry()` from `lib/communications/retry-eligible.ts`: no new log row, outcome recorded on the original. Outcome mapping: sent → `{ retried: true }`; failed/skipped → `{ retried: false, reason }`; attempt already claimed elsewhere → `{ retried: false, reason: "already retried" }`. Note the behavior change: a skipped manual retry used to report `retried: true`; it now correctly reports `false`.
- **P2 — claim before send.** `retry_count`/`last_retry_at` are claimed via a guarded update (`id` + `church_id` + expected `retry_count`) *before* dispatch, closing the double-send window between overlapping cron runs and the unbounded re-send Agent 3 flagged after a failed outcome write. The outcome write is guarded on the claimed count. The DLQ is written once the claimed count reaches the 3-attempt budget (the claim alone already made the row ineligible), or, for a non-transient code, only once that code is durably recorded on the row. `updateSourceRow` dropped its local-fallback branch and is now Supabase-only, per the Supabase-only architecture mandate (§2 item 5 of the synthesis); `markSent`/`markFailedAgain`/`consumeAttemptWithoutSend` are gone, replaced by `attemptRetry`/`recordFailure`.
- **P3 — hardening.** New `skipCode: "opted_out" | "suppressed"` on `QueueCommunicationResult` drives distinct DLQ codes (`recipient_opted_out` / `recipient_suppressed`) instead of one bucket. `error_message`/`last_error_message` truncated to 500 characters. Source-row update guard gained `.eq("church_id", row.church_id)`. New tests for the dispatch-throw path and a failed outcome write.

Verified after `4f2ce1c`: `npx tsc --noEmit` clean; `npx vitest run` 1611/1611 passed, 134 files; `npm run lint` 0 errors / 7 pre-existing warnings; `npm run build` clean.

## Residual risk

- **Resend is not wired for sending (Council Review 16 Agent 4, corrects this doc's original framing below).** ADR 0006 designates Resend as the primary provider, selected when `RESEND_API_KEY` is present. In code, `queue-communication.ts` always sends email through the SendGrid adapter (falling back to a stub when `SENDGRID_API_KEY` is unset); `resendAdapter` is imported only by its own webhook route. Combined with the adapter-code mismatch below, **no path in production today writes a transient `error_code` at all** — the retry cron and the operator's manual Retry both currently receive no real input to act on. This branch's pipeline fixes are correct but currently exercise a path production can't reach. Tracked as follow-up **F2**.
- **Adapter code mismatch (pre-existing):** SendGrid and Twilio report failures as `sendgrid_<status>` / `twilio_<status>`, which never match the cron's transient set (`timeout`, `rate_limited`, `provider_unavailable`, `network_error`, `temporary_failure`). Only Resend's `network_error` would — but see above, Resend is never selected. Folded into follow-up **F2**.
- **Cron consent/suppression compliance bug (Council Review 16, Agents 1/2/3), follow-up F1, must land before F2.** `findSuppression` (`send-with-suppression.ts`) and `checkOptIn` (`queue-communication.ts`) use the cookie-based `createTenantServerClient()`. The cron runs without a session, so both lookups execute as anon against `to authenticated` RLS policies and return nothing — suppressed or unsubscribed recipients would be re-sent, and every SMS retry is treated as opted out. This is latent today only because no transient code is ever written (see above); it becomes live and urgent the moment F2 wires a real provider, which is why F1 must ship first.
- The optimistic `retry_count` guard means a lost race counts the attempt in the run's summary without recording it. The winning run records it.

## Follow-up

- **F1 (compliance, must precede F2):** run the cron's `findSuppression`/`checkOptIn` lookups through the admin client (still scoped by `church_id`) instead of the anon cookie client.
- **F2:** implement Resend selection per ADR 0006 (or amend the ADR to match reality), and map provider HTTP statuses (429, 5xx) and thrown `fetch` errors to transient codes in all three adapters. Merge `TRANSIENT_ERROR_CODES` (`retry-eligible.ts`) and `TRANSIENT_PROVIDER_ERROR_CODES` (`provider-adapter.ts`) into one list.
- **F3:** DLQ visibility — report swallowed bookkeeping failures to Sentry; add a bookkeeping-failure count to `RetryEligibleResult` feeding the cron's 207; explain the disabled Retry button with a tooltip/`aria-describedby`; add a minimal DLQ view.
- **F4:** verify whether the webhook log lookup (outside this diff) can actually match rows under the anon cookie client, per Council Review 16 Agent 1's caveat — plausible, not confirmed this round.
- The Council ran on this branch before merge (per `improve-software.md` §0) — see Council Review 16 above. This is a behavior change to the retry pipeline, not a small isolated fix.
