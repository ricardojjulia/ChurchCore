# Council Review 17 — Agent 1: Database & API Audit

**Branch:** `fix/comms-cron-consent-suppression-lookups` (`56247ae`) vs `main` (`0c8d27f`). Diff-scoped; all findings checked in source.

## 1. Tenant isolation
All four calls that moved to the admin client filter or set `church_id`: `send-with-suppression.ts:61`, `:114`, and `queue-communication.ts:280`, `:348`. In each case the value is `session.appContext.church.id`. Where that comes from:
- `broadcastMessageAction` (`communications-actions.ts:104`) and the segment send (`:761`): `requireChurchSession`.
- The scheduled cron: `log.church_id`, a database row.
- The retry cron and operator retry: `row.church_id`, or the session church.

**Caveat:** `broadcastMessageAction` takes `recipients` from the client (`:69`), so the caller controls both `recipientProfileId` and `recipientContact`. The lookups stay inside the caller's church, so there is no cross-tenant leak. But nothing ties the contact to the profile, or the profile to the church. The consent answer is about whichever profile the client names, not the address that actually receives the message.

## 2. RLS / schema
- All inserted columns exist (`20260528101500:7-38`), and every status, provider and channel value passes its CHECK constraint.
- The only policy the admin client now bypasses is `communication_logs_insert_management` (`can_manage_church`, `20260418000000:140`).
- No policy enforced `sent_by = auth.uid()`, so nothing else is lost.

## 3. Failure semantics
- **Scheduled cron:** per-recipient `try/catch` (`route.ts:122-137`). A consent throw drops that recipient with no log row, and the parent is still marked `sent`.
- **Retry cron:** catches at `retry-eligible.ts:231` and records `unknown_error`, which is non-transient. A brief consent-read failure therefore dead-letters the message immediately. On `main` that error was ignored.
- **Segment send (`communications-actions.ts:759`):** no `try/catch`, so one throw stops the broadcast partway through and the parent row stays `queued`.
- **`writeLog`:** returning instead of throwing is correct.

## 4. No-user paths still on the cookie client
- **`recipient-resolver.ts:26`:** the scheduled cron resolves `[]` as anon, then marks the log `sent` having sent nothing. The ADR's claim that it "sends to suppressed addresses" can't happen on Supabase today. The cron benefit applies to the **retry cron only**.
- **`webhook-events.ts:55, 178`:** tracked as F4.
- **`communications-actions.ts:738-751`:** the segment send's parent insert fails RLS for a secretary.
- **`send-sms.ts`:** dead code with no importers.

## 5. Tests
`npx vitest run lib/communications lib/notifications`: **12 files, 93 tests, all passed.**
Gaps:
- The retry DLQ path when `checkOptIn` throws is untested.
- The scheduled cron's resolution without a user is untested.
- No test covers foreign `profileId`s in `broadcastMessageAction`.

## 6. Top issues
1. **HIGH: `queueCommunicationAction` is a public server action that trusts its `session` argument.**
   - `queue-communication.ts:1` is `"use server"`, and the built `server-reference-manifest.json` registers the action on 6 pages.
   - With the action ID, a caller could POST a forged session for any church. That would reveal consent state, send through the platform's SendGrid/Twilio, and mint valid unsubscribe links.
   - On this branch it could also write forged `communication_logs` rows as service role; on `main`, RLS rejected those inserts.
   - Fix before merge: replace `"use server"` with `import "server-only"`.
2. **MEDIUM:** the scheduled cron cannot resolve recipients (`recipient-resolver.ts:26`). Either move the resolver under the same rule or correct the ADR.
3. **MEDIUM:** a transient consent-read error dead-letters a retry (`retry-eligible.ts:231-234`).
4. **MEDIUM:** `recipients` supplied by the client lets a sender get around consent (`communications-actions.ts:69,98`). Resolve recipients on the server from `recipientIds`.
5. **LOW:** the segment send loop has no per-recipient catch (`:759-769`).
6. **LOW (pre-existing):** `findSuppression` passes the raw contact to `.ilike` (`send-with-suppression.ts:63`). `_` and `%` act as wildcards, and a match on several rows makes `.maybeSingle()` throw.
