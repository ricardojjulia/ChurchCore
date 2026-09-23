# Council Review 17 — Agent 3: UX & Shell Audit

**Branch:** `fix/comms-cron-consent-suppression-lookups` (`56247ae`) vs `main`. Diff-scoped and backend-only.

## 1. Members
- **Unsubscribe:** the link goes to `app/api/unsubscribe/route.ts`, which upserts a lowercased row with the admin client (`:55-70`). `findSuppression` now reads it with the admin client, so the retry cron and secretary sends honour it. Correct.
- **Scheduled broadcasts do not reach the check on Supabase.** `resolveRecipients` (`recipient-resolver.ts:26`) uses the cookie client, and every `profiles` select policy is `to authenticated`. The cron runs as anon, resolves zero recipients, and marks the parent `sent` (`route.ts:141-144`). **The real symptom is that scheduled broadcasts silently go to nobody while showing "sent".** ADR 0022:19-20 ("sent to unsubscribed and bounced addresses") is inaccurate for this path.
- **Preference opt-out:** `checkOptIn` now uses the admin client, so an opt-out is honoured whoever sends.

## 2. Staff
- A suppressed skip writes a `suppressed` row (grape badge). An opt-out skip writes nothing (`queue-communication.ts:79-86`) and shows only in the hub toast; compose ignores results entirely (`communications-actions.ts:760-769`).
- **New:** duplicate `suppressed` rows on retries, because `sendWithSuppression` ignores `recordLog: false` on its suppressed branch. There can be up to 3 per message.
- Nothing tells staff why skipped counts or suppressed rows might suddenly rise.

## 3. Failure behaviour
- **Hub bulk send:** the loop has no try/catch (`:97-118`). A throw loses the counts for recipients already sent. The toast is red and the form stays filled, which invites a resend and duplicate messages.
- **Error message:** Next.js hides server-action error messages in production, so staff get a generic, unhelpful error.
- **Compose:** no catch (`compose-client.tsx:204`). The error lands in the error boundary, and the parent row stays `queued` forever.
- **Scheduled cron:** catches per recipient but still marks the parent `sent`.
- **Deploy risk:** a missing service-role key now fails every interactive send.

## 4. Still silent
- `app/api/unsubscribe/route.ts:56-70` ignores the upsert's `error`, so a member sees "unsubscribed successfully" even when nothing was stored.
- The scheduled cron doesn't check its parent-status updates or detect a zero-row optimistic lock (`route.ts:89-93, 141-157`).
- `dispatchPush` ignores its query error and swallows per-subscription results.
- `findSuppression` passes the raw contact to `ilike`, so `_`/`%` act as wildcards, and a match on several rows makes `.maybeSingle()` throw.

## 5. Top 3 pain points
1. Scheduled broadcasts reach nobody and show "sent" (`recipient-resolver.ts:26`, `route.ts:105, 141-144`).
2. A throw partway through a loop drops the partial counts and invites duplicate resends (`communications-actions.ts:97-118, 760-769`).
3. Unsubscribe can report success when the write failed (`unsubscribe/route.ts:56-70`), plus the duplicate suppressed rows.

**Recommendation:** OK to merge as a partial fix. Items 1 and 3 are blocking follow-ups, and ADR 0022:19-20 needs correcting.
