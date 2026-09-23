# Council Review 17 — Agent 2: Route & Page Audit

**Branch:** `fix/comms-cron-consent-suppression-lookups` (`56247ae`) vs `main`. Diff-scoped. No routes, pages or nav changed; every caller was traced in source.

## 1. Entry points

| Entry point | File:line | Gate | Session | Change on this branch |
|---|---|---|---|---|
| `broadcastMessageAction` (hub) | `communications-actions.ts:69,104` | `requireChurchSession` plus pastor/church-admin/secretary (`:71-75`) | Real user | Secretary sends now honour suppression and consent, and write log rows. Pastor/admin sends are unchanged. |
| `composeAndSendMessageAction` | `:685,761` | `commRoleAllowed` (`:689`) | Real user | Per-recipient checks are fixed. A secretary still fails earlier, at the cookie-client parent insert (`:730`); that was already the case. |
| `retryCommunicationAction` | `:123`, `attemptRetry` at `:249` | `:126` | Real user | No change for pastor/admin. A secretary is blocked earlier, at the cookie-client log read (`:179`). |
| `retryAllEligibleAction` | `:617,627` | `:620` | Synthetic, per row | Suppression and consent are now honoured. |
| `GET /api/cron/communications-scheduled` | `route.ts:14-27,108-123` | `CRON_SECRET` | Synthetic | The per-recipient checks are fixed. *(Synthesis note: recipient resolution still returns nobody on Supabase; see the synthesis §2.)* |
| `GET /api/cron/communications-retry` | `route.ts:12-25,53` | `CRON_SECRET` | Synthetic | Suppression and consent are now honoured. |

No webhook reaches the send path (F4 is tracked separately).

## 2. Auth gates
- All four actions check roles on the server and take `church_id` from the session.
- Both crons fail open when `CRON_SECRET` is unset and `NODE_ENV !== "production"`, and compare the secret with `===`. Both are pre-existing and low risk.
- `broadcastMessageAction` trusts a client-supplied `recipients` array. A null `profileId` skips the consent check. This is pre-existing, but the admin client is now the only consent control, so it should be resolved on the server.

## 3. UI consequences
- History will show more rows. Cron sends now log per recipient with `sent_by` null, so the "Sent by" column is blank.
- Secretary sends now show up in admin history, but a secretary still cannot read history.
- **Duplicate `suppressed` rows:** `writeSuppressedLog` ignores `recordLog: false` (`send-with-suppression.ts:143`). A suppressed source row stays eligible, so it can produce up to 3 `suppressed` rows. This only shows up now that the lookup works.
- Scheduled SMS will now actually go to opted-in members, and Twilio will bill for it.

## 4. Findings
1. **Medium:** `checkOptIn` now throws, and the interactive send loops don't catch it (`:97-120`, `:760-770`). A failure partway through leaves a partial send, and for compose the parent row stays `queued`.
2. **Medium:** duplicate suppressed log rows on retry.
3. **Low/Medium:** the client-supplied `recipients` in `broadcastMessageAction`.
4. **Low:** crons fail open outside production, and the secret comparison is not constant-time.
5. **Info (pre-existing):** a secretary can't compose (`:730`), retry (`:179`) or view history, even though `commRoleAllowed` lets them in. `composeAndSend` never moves its parent row past `queued`.
