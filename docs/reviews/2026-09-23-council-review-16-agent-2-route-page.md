# Council Review 16 — Agent 2: Route & Page Audit

**Branch:** `fix/comms-retry-dlq-copilot-findings` (commit `00c49bb`) vs `main`
**Scope:** Diff-scoped. No pages or nav changed; the agent traced every caller of `retryEligibleCommunications`, `sendWithSuppression`, and `queueCommunicationAction`.

## Summary table

| Entry point | File | Behavior change? | Notes |
|---|---|---|---|
| Cron `GET /api/cron/communications-retry` | `app/api/cron/communications-retry/route.ts:53` | **Yes** | No new `communication_logs` row per attempt. The source row gets `sent_at`/`provider`/`provider_message_id`/`error_message`. DLQ now also covers non-transient failures and skips that exhaust the budget. The response shape and 207-on-`failedAgain` are unchanged. |
| `retryAllEligibleAction` (hub "Retry all") | `app/app/communications-actions.ts:602` | Yes (same as the cron) | The toast uses the same count fields, so the UI is unchanged. |
| `retryCommunicationAction` (per-row Retry) | `app/app/communications-actions.ts:122, 243` | **No** | Still inserts a new row with `retry_count+1` and never touches the original. See Finding 1. |
| `sendMessageAction` bulk send | `app/app/communications-actions.ts:103` | No | `recordLog` defaults to true. |
| Segment send lifecycle | `app/app/communications-actions.ts:746` | No | |
| Cron `communications-scheduled` | `app/api/cron/communications-scheduled/route.ts:123` | No | Only gains the optional `provider`/`errorCode` result fields. |

## Delivery-history UI / loaders
`lib/communications-data.ts:123,240` load one row per log with `retry_count`/`error_code`. The hub (`communications-hub.tsx:647`, "n/3") and history (`communications-history-workspace.tsx:253`) read `retryCount` from the row itself. Nothing counts or groups attempt rows, so dropping per-attempt rows loses no feature. What changes for users: duplicate failed rows disappear, the original row now reaches 3/3, and a retried success shows a real `sent_at`. Side effect: `markSent` leaves the old `error_code`/`error_message` on a `sent` row. That's harmless to eligibility, since the UI keys off `status` first, but it is stale data.

## Findings (ranked)
1. **Medium (pre-existing, now inconsistent with the branch's own contract): the manual Retry button still fans out and can double-deliver.** `retryCommunicationAction` (`communications-actions.ts:243`) sends, then inserts row B through `writeLog` under the user's session. Row A stays `failed`, keeps its transient code, and keeps `retry_count < 3`.
   - If B succeeds, the next cron run or "Retry all" still picks up A and re-sends it.
   - If B fails transiently, both A and B are cron-eligible.
   - A's count never increments, so per-row retry on A is unbounded.
   Suggested fix: route manual retry through the cron's update-the-source-row path, for example a single-row export.
2. **Medium (new consequence on Supabase): cron SMS retries are always skipped and now dead-lettered as `recipient_suppressed`.** `checkOptIn` (`queue-communication.ts:272`) uses the cookie client. In the cron there is no session, and the only select policy on `notification_preferences` is own-row or `can_manage_church` (migration `20260418000000:45-51`). So the lookup returns nothing and falls back to `channel !== "sms"`, which means SMS is treated as opted out. Before this branch those skips only consumed `retry_count`. Now `consumeAttemptWithoutSend` dead-letters them at exhaustion, with a misleading code. Opt-out and suppression also share one label (`recipient_suppressed`), although `last_error_message` keeps the real reason.
3. **Low (pre-existing): cron suppression lookups do nothing on Supabase.** `findSuppression` (`send-with-suppression.ts:53`) uses the anon cookie client against an authenticated-only policy, so suppressed email addresses are not detected in the cron. Where suppression *is* detected, `writeSuppressedLog` still inserts a `suppressed` row on each attempt. `recordLog: false` doesn't cover that path.
4. **Low (new): exceptions are dead-lettered immediately.** The catch block records `unknown_error`, which is non-transient, so the row goes to the DLQ after one attempt. That includes config errors such as a missing `UNSUBSCRIBE_SECRET`. This is more honest than before, when rows silently fell out of eligibility, but a config outage floods the DLQ and there is no re-drive page.

**Verified, no issue:** the new `provider`/`errorCode` result fields and the `recordLog` input are optional and additive; no unchanged caller reads or sets them.
