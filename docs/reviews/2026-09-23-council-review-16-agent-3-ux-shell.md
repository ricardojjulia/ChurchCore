# Council Review 16 — Agent 3: UX & Shell Audit

**Branch:** `fix/comms-retry-dlq-copilot-findings` (commit `00c49bb`) vs `main`
**Scope:** Diff-scoped. No UI files touched. The agent traced the hub UI and its loaders from source.

## 1. What an admin sees in `/app/communications`
The loaders (`lib/communications-data.ts:109-124, 240-284`) select `error_code` and `retry_count` and **never select `error_message`**. The hub (`components/application/communications-hub.tsx`) uses `errorCode` only for the eligibility check (`:88-92`) and never renders it. So nothing shows a code as a message or the reverse, but admins also see no failure reason at all. That part is unchanged.

- **(a) Retried, then succeeded:** "Sent" badge; retry column shows `n/3`. `markSent` now sets `sent_at` (`retry-eligible.ts:273`), so the date column shows the real send time, and copies `provider_message_id` so delivery webhooks can move the row to "Delivered". An improvement. The old `error_code`/`error_message` remain on the sent row; nothing shows them, but the data is misleading.
- **(b) Retries exhausted:** "Failed" badge, `3/3` in red, Retry disabled. Nothing indicates the message was dead-lettered; no UI or loader reads `communication_dlq`.
- **(c) Dead-lettered for a non-transient code:** "Failed" badge, but the retry column shows `1/3` or `2/3` in dimmed grey and Retry is disabled with no tooltip or reason (`:672, :702`). It looks as if retries remain, but none are available.

## 2. Error handling / observability
Sentry is wired server-side (`instrumentation.ts`, `onRequestError = Sentry.captureRequestError`), but that only reports thrown errors. The new helpers swallow errors into `console.error` (`retry-eligible.ts:257, 262, 361, 366`), so nothing reaches Sentry. This matches the rest of the repo (the only `captureException` is in `app/global-error.tsx`). `RetryEligibleResult` has no counter for failed bookkeeping writes, and the cron returns 200/207 based only on `failedAgain` (`route.ts:54`). If every source-row update failed, operators would still see 200s.

If `markSent`'s update fails (`:283`), the row stays `failed` with the same `retry_count`, and the next run re-sends it with no limit. *(Synthesis note: pre-existing. `main` also discarded `markSent`'s update result.)*

## 3. Loading / empty / ARIA
Nothing new was touched. Related gap: the disabled Retry button gives no explanation (no Tooltip or `aria-describedby`) for rows that are ineligible but not yet at 3/3.

## 4. Top 3 pain points
1. **The cron bypasses suppression and email opt-out checks.** Pre-existing, but the branch builds on it. `findSuppression` (`send-with-suppression.ts:53`) and `checkOptIn` (`queue-communication.ts:~272`) use `createTenantServerClient()` (cookie-based). The cron has no session, and the `communication_suppressions` select policy is authenticated-only (`20260528101500_…sql:144-146`), so the lookups likely return zero rows. Suppressed contacts get re-sent. Email opt-out is skipped too, because a missing preference row defaults to opted in. From the admin-triggered path the session exists, but `writeSuppressedLog` (`:140`) still inserts a new `suppressed` row per attempt despite `recordLog: false`. The unit test (`retry-eligible.test.ts:421`) mocks `sendWithSuppression`, so it can't catch this.
2. **The per-row Retry button still fans out.** `retryCommunicationAction` (`communications-actions.ts:243-250`) calls `sendWithSuppression` without `recordLog: false` and never updates the original row. The original stays eligible, so the cron can re-send a message the admin already retried manually.
3. **Real provider failures are dead-lettered immediately, with no visible reason.** `sendgrid_503`, `twilio_429` and similar codes (`sendgrid-adapter.ts:102`, `twilio-adapter.ts:87`) aren't in `TRANSIENT_ERROR_CODES`, so the new terminal rule (`retry-eligible.ts:299`) dead-letters a transient 503 after one retry. Thrown sends become `unknown_error`, which is also terminal. The admin just sees "Failed 1/3" with a disabled button. `error_message`/`last_error_message` store untruncated provider response text, which may include recipient addresses. *(Synthesis note: `writeLog` already stores untruncated provider text on first send; the DLQ copy is not new exposure, but truncating is cheap.)*

**Verdict:** a net improvement for the cron. Items 1–2 are pre-existing but make the new DLQ semantics misleading. They are follow-ups, and item 1 needs its own ticket as a compliance issue (sends to unsubscribed or suppressed contacts).
