# Council Review 16 — Agent 4: Feature & Competitive Audit

**Branch:** `fix/comms-retry-dlq-copilot-findings` (commit `00c49bb`) vs `main`
**Scope:** Diff-scoped. The agent ran `npx vitest run` itself: **1610/1610 passed, 134 files**. The comms/notifications subset: 89/89 across 12 files.

## 1. Are the five fixes actually in source?

| # | Finding | In source? | Evidence |
|---|---|---|---|
| 1 | Retry fan-out | **Yes** | The cron passes `recordLog: false`, and `queueCommunicationAction` skips `writeLog` when it is false. `markSent` copies `provider`/`provider_message_id`/`external_id` onto the source row so webhooks can match. |
| 2 | False DLQ record on a failed update | **Yes** | `updateSourceRow` is guarded on `retry_count = <selected>` with `.select("id")`, returns a boolean and never throws. The DLQ is written only when it returns `updated`. |
| 3 | Missing DLQ record for missing/suppressed recipients | **Yes** | `consumeAttemptWithoutSend` dead-letters at ≥3 with `recipient_missing`/`recipient_suppressed`. |
| 4 | Code and message conflated | **Yes** | `QueueCommunicationResult.errorCode` is new. Separate `error_code`/`error_message` and `last_error_code`/`last_error_message` are written. |
| 5 | Supabase path untested | **Yes** | 13 tests under the Supabase admin path, covering a failed update, a zero-row update, a DLQ upsert failure, and missing/suppressed recipients at exhaustion. |

**Communications completion:** ~78% → ~80%. "Resend/Twilio dispatch with suppression rules": ~60%. Suppression works, but dispatch is misdescribed (§2).

## 2. The residual gap is worse than documented
`lib/notifications/queue-communication.ts` **always** sends email through `sendgridAdapter`. `resendAdapter` is imported only by the webhook route `app/api/webhooks/resend/route.ts`. That contradicts ADR 0006, `docs/runbooks/communications.md` and `docs/setup/production-deployment.md`, which all name Resend as primary. A deployment that sets only `RESEND_API_KEY` sends email in **stub mode**: sends are reported as accepted and nothing goes out.

As a result, nothing in production ever writes a transient `error_code`:
- SendGrid and Twilio emit `sendgrid_<status>`/`twilio_<status>`.
- Neither adapter wraps `fetch` in a try/catch, so a network error throws before `writeLog` and no log row is created.
- Delivery webhooks write `error_code = 'provider_event'` (`webhook-events.ts:131, 221`).

So the retry cron **and** the operator retry button (`communications-actions.ts:202`, which checks `shouldRetryDelivery`) never get production input. This branch correctly fixes a pipeline that is currently switched off.

**Competitive:** PCO, Breeze and Tithe.ly run on managed ESPs that retry 429/5xx automatically. Here, an admin sees "failed" with no automatic recovery, and a Resend-configured tenant sees "sent" for mail that never went out.

**Block the merge? No.** It is strictly better and introduces no regression. But this is a **P1 follow-up that blocks any claim that communications reliability is production-ready**:
1. Wire up Resend selection per ADR 0006.
2. Map 429/5xx responses and thrown errors to the transient codes in all three adapters.
3. Merge `TRANSIENT_ERROR_CODES` and `TRANSIENT_PROVIDER_ERROR_CODES` into one list.

## 3. Scope creep
- Immediate dead-lettering of non-transient re-failures is justified: such a row is terminal anyway, and before it vanished without a record. It is documented and tested.
- The `provider`/`errorCode` result fields are needed for fixes #1 and #4.
- Minor mandate issue: `updateSourceRow` adds new code inside a local-fallback branch, with interpolated column names from internal keys only, so there is no injection risk. That goes against the Supabase-only mandate. It is harmless, but it shouldn't set a precedent.
- **Missed sibling bug:** `retryCommunicationAction` (`communications-actions.ts:243`) still dispatches without `recordLog: false`, which means the same fan-out and a possible double send. It is dormant only because of §2.

## 4. MVP readiness: **68/100, unchanged** (within the 67–69 band)
A correctness fix to a reliability path that production can't reach yet. The newly found primary-provider wiring gap offsets any gain. Expect +1 to +2 once Resend selection and transient-code mapping ship.

**Verdict:** approve the merge, and record the Resend wiring gap and the manual-retry fan-out as named follow-ups.
