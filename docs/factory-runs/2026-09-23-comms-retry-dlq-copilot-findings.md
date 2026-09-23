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

- `npx vitest run`: **1610/1610 passed**, 134 files (retry-eligible: 13 Supabase-path tests covering final failure, failed update, zero-row update, transient with budget left, non-transient, missing/suppressed exhaustion, missing with budget left, DLQ upsert failure, `recordLog: false`, provider id on success, and the churchId filter; plus 3 local-path DLQ tests. queue-communication: a new `recordLog: false` test).
- `npx tsc --noEmit`: clean.
- `npm run lint`: 0 errors, 7 pre-existing unrelated warnings (unchanged baseline).
- `npm run build`: clean.

## Residual risk

- **Adapter code mismatch (pre-existing, not fixed here):** SendGrid and Twilio report failures as `sendgrid_<status>` / `twilio_<status>`, and these never match the cron's transient set (`timeout`, `rate_limited`, `provider_unavailable`, `network_error`, `temporary_failure`). Only Resend's `network_error` does. So first-send failures on those two providers are not auto-retried today. With this change, a retry that re-fails with such a code is dead-lettered after one attempt, which matches how the query would treat it anyway.
- The optimistic `retry_count` guard means a lost race counts the attempt in the run's summary without recording it. The winning run records it.

## Follow-up

- Map provider HTTP statuses (429, 5xx) to the transient codes in the SendGrid/Twilio adapters, and add a test that ties `TRANSIENT_ERROR_CODES` in `retry-eligible.ts` to `TRANSIENT_PROVIDER_ERROR_CODES` in `provider-adapter.ts`. They are two copies of the same list today.
- The Council must run on this branch before merge (per `improve-software.md` §0). This is a behavior change to the retry pipeline, not a small isolated fix.
