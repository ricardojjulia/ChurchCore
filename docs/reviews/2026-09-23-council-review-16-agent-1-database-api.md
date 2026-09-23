# Council Review 16 — Agent 1: Database & API Audit

**Branch:** `fix/comms-retry-dlq-copilot-findings` (commit `00c49bb`) vs `main`
**Scope:** Diff-scoped (8 files, no `supabase/` changes).

**Verdict: the diff is correct and safe to merge.** None of the issues below is a regression introduced here. Issues 1–3 affect how the cron behaves in production.

## 1. Migrations / schema
- No migration added (`git diff --stat -- supabase` is empty).
- Every column written exists: `status`, `sent_at`, `error_message`, `external_id` (`20260418000000_communications_phase6.sql`); `provider`, `provider_message_id`, `retry_count`, `last_retry_at`, `error_code` (`20260528101500_phase3_...sql`).
- CHECK constraints are satisfied: `status` is `'sent'`/`'failed'` (allowed by `communication_logs_status_check`); `provider` is `sendgrid`/`twilio` (allowed); `retry_count` is ≥ 1.
- The DLQ upsert matches `20260920000000_communication_dlq.sql`. All columns exist, `channel` is email/sms only, `attempted_count` is ≥ 1, and `onConflict: communication_log_id` has a matching unique index.

## 2. Library correctness
- **Guard** (`retry-eligible.ts:232-265`): the Supabase update filters `.eq("id").eq("retry_count", row.retry_count).select("id")`, so it returns the updated rows and an empty array means "not updated". Local-SQL parameter numbering is correct (`$1` id, `$2` retry_count, `$3…` patch). Column names come only from hard-coded patch keys, so there is no injection risk. That branch is dead code (`shouldUseLocalTenantFallback()` returns `false`, `tenant.ts:40-44`). The helper never throws.
- **DLQ only after the update succeeds** (`:302`, `:321`). Correct.
- **Terminal rule** `newRetryCount >= 3 || !TRANSIENT_ERROR_CODES.includes(code)` (`:299-300`). Correct.
- **`consumeAttemptWithoutSend`** leaves `status`/`error_code` untouched, so the row stays eligible until the budget runs out. Correct.
- **`recordLog: false`** prevents a second eligible row: dispatch is blocked at `queue-communication.ts:145`, and the consent opt-out path returns before any write (`:76-85`). The suppressed path still inserts a `'suppressed'` row (`send-with-suppression.ts:140`), but that row is never eligible, so it adds audit rows without causing fan-out.
- Other callers (`communications-actions.ts`, the `communications-scheduled` cron, `send-sms.ts`) leave `recordLog` undefined, so they still log. The new result fields are optional. No regression.

## 3. Webhook matching
The source row now carries `provider_message_id` and `external_id`, and `resolveCommunicationLog` matches either (`webhook-events.ts:44-45, 59`). Correct. *Pre-existing caveat:* that lookup uses the cookie-based `createTenantServerClient()` (anonymous role for a provider webhook) against a table with no anon SELECT policy. Worth checking separately.

## 4. Tests
`npx vitest run lib/communications lib/notifications`: **12 files, 89 tests, all passed** (run by the agent).
Gaps:
- The Supabase-path `catch` branch is untested.
- `markSent` with a zero-row update is untested.
- The suppressed-path insert under `recordLog: false` is untested.
- The tests mock transient codes (`timeout`, `provider_unavailable`) that the real SendGrid/Twilio adapters never produce.

## 5. Tenant isolation / RLS
Updates filter on the UUID `id` taken from rows this run selected, with the `churchId` filter applied at selection. Acceptable; no isolation regression. Adding `.eq("church_id", row.church_id)` would be cheap extra protection. The DLQ is written only via the service role, as intended.

## 6. Top issues (none are blockers for this diff)
1. **Provider errors are classified as non-transient.** SendGrid/Twilio emit `sendgrid_<status>`/`twilio_<status>` (`sendgrid-adapter.ts:102`, `twilio-adapter.ts:87`), none of which is in `TRANSIENT_ERROR_CODES`. A retried send that gets a 503 is dead-lettered after one attempt. First-send rows with those codes are never selected by the cron at all (pre-existing).
2. **The cron bypasses suppression and consent** (pre-existing). `findSuppression` and `checkOptIn` use the anon-role cookie client in a cron with no session. RLS (`to authenticated`) makes both lookups return nothing, so suppressed email recipients get re-sent, and every SMS retry is treated as opted out.
3. **Overlapping runs can double-send.** The guard runs after the send (`:80` → `:283`), so it prevents double bookkeeping but not a double send. Claiming the attempt before sending would close this.
4. **Configuration errors are dead-lettered permanently.** A missing `UNSUBSCRIBE_SECRET` throws, is recorded as `unknown_error`, and is dead-lettered after one attempt. `fetch` network rejections take the same path.
5. **Suppressed retries add up to 3 extra `suppressed` audit rows** per message. Low severity.

**Recommendation:** merge. Follow-ups for 1 and 2; issue 2 has the most consequence.
