# Factory run — Cron/secretary consent & suppression lookups, unauthenticated server actions, Council Review 17

- **Date:** 2026-09-23
- **Branch:** `fix/comms-cron-consent-suppression-lookups`
- **Commits:** `56247ae` (F1, Council Review 16 follow-up) → `6e005d4` (Council Review 17 prompts P1–P4)
- **Base:** `main` at `0c8d27f` (PR #148 merge)
- **Trigger:** Council Review 16's F1 — the retry cron's `findSuppression`/`checkOptIn` lookups ran through the cookie-based client with no session, so they executed as `anon` against `to authenticated` RLS and silently returned nothing.

## Intent

Make suppression and consent answers independent of who (or what) is asking. Crons have no user session, and secretaries sit outside `can_manage_church`; both were previously getting default/empty answers from RLS-gated reads instead of a real compliance decision.

## Findings and resolution

| # | Finding | Source | Resolution |
|---|---|---|---|
| 1 | `findSuppression`, `checkOptIn`, `writeLog`, `writeSuppressedLog` ran on the cookie client — crons run as anon, so suppression read "none" and consent fell back to defaults (email on, SMS off); audit inserts were silently rejected | Council Review 16 F1 | Commit `56247ae`: all four moved to the admin client (`createTenantAdminClient()`), scoped by `church_id` from the server-side session (new [ADR 0022](../adr/0022-communications-compliance-lookups-admin-client.md)). A failed consent read now fails closed (throws); a failed audit insert logs, doesn't throw. |
| 2 | Our own ADR 0022 draft and `56247ae`'s commit message claimed scheduled broadcasts "reached unsubscribed and bounced addresses" | Council Review 17, verified independently by Agents 1, 3, 4 | Wrong. `resolveRecipients` (`recipient-resolver.ts:26`) was still on the cookie client and resolved `[]` as anon — the cron sent to **nobody** and marked the broadcast `sent`. A silent delivery failure, not a compliance leak. Corrected in ADR 0022 and this doc. |
| 3 | HIGH: `queueCommunicationAction` (`lib/notifications/queue-communication.ts`) was a `"use server"` export trusting a caller-supplied `session` — a POST-callable Server Action, registered on 6 pages in the build manifest | Council Review 17 Agent 1 | `import "server-only"` replaces `"use server"`. Confirmed removed from `.next/server/server-reference-manifest.json`. |
| 4 | Found while verifying #3, outside the reviewed diff: `lib/actions/audit.ts`'s `logAuditEvent` and `pruneAuditLogsAction` were also `"use server"`, wrote with the service role, and had **no authentication at all**; `pruneAuditLogsAction` deletes `audit_log` rows across every church and has no callers | Council Review 17 synthesis §2 item 3 | Both moved to `import "server-only"`. `pruneAuditLogsAction` was kept rather than deleted — ADR 0012 intends pruning via `pg_cron`, and the function has its own test; `server-only` already closes the external HTTP path either way. |
| 5 | `broadcastMessageAction`/`composeAndSendMessageAction` had no per-recipient error handling — one throw could stop a bulk send partway through with lost counts and the parent row stuck `queued` | Council Review 17 Agents 1, 2, 3 | Per-recipient `try/catch` with honest sent/skipped/error counts. `writeSuppressedLog` now honours `recordLog: false`. A thrown dispatch/lookup error in `attemptRetry` is recorded as `temporary_failure` (retries within budget) instead of dead-lettering immediately. |
| 6 | Unsubscribe route ignored its upsert `error`; `findSuppression`'s `ilike` didn't escape `%`/`_` wildcards; dead `lib/notifications/send-sms.ts` had no callers | Council Review 17 Agents 3, 4 | Unsubscribe route now checks the error and reports failure honestly. Wildcards escaped. Dead file deleted. |

## Architecture impact

- New [ADR 0022](../adr/0022-communications-compliance-lookups-admin-client.md): communications compliance lookups (`findSuppression`, `checkOptIn`), audit writes (`writeLog`, `writeSuppressedLog`), `resolveRecipients`, and the compose parent-log insert/close-out all use the admin (service-role) client, explicitly scoped by `church_id` from the server-side session or a DB row — never client input.
- New rule, added to ADR 0022 and `README.md`: a module whose exported functions take a trusted `session` or tenant id as an argument must be `import "server-only"`, never `"use server"`. Only a module whose exports authenticate their own caller (`requireChurchSession` plus a role check) may be `"use server"`. `lib/actions/erasure.ts` and `lib/compliance/data-rights-actions.ts` were checked against this rule and are fine — both call `requireChurchSession` internally.
- No schema change, no new dependency.

## Verification

- `npx tsc --noEmit`: clean.
- `npx vitest run`: **1629/1629 passed**, 135 files (independently re-run by the Documenter).
- `npm run lint`: 0 errors, 7 pre-existing unrelated warnings (unchanged baseline).
- `npm run build`: clean.
- Manifest check: `.next/server/server-reference-manifest.json` no longer registers `queueCommunicationAction`, `logAuditEvent`, or `pruneAuditLogsAction`.
- Source check: `lib/actions/erasure.ts` and `lib/compliance/data-rights-actions.ts` (the two remaining `"use server"` exports under `lib/`) both call `requireChurchSession` before doing anything else.

## Council Review 17

Diff-scoped against commit `56247ae` (`docs/reviews/2026-09-23-council-review-17-synthesis.md`). All four agents approved and independently confirmed the four moved calls stay correctly tenant-scoped — `church_id` always comes from the server-side session or a DB row, never client input. Two corrections were made during synthesis (see Findings #2 and #3/#4 above); MVP readiness reconfirmed **68/100, unchanged** (P2's scheduled-broadcast fix is the first time that path works on Supabase at all, offset by the still-open gaps below). Full agent reports: [agent-1-database-api](../reviews/2026-09-23-council-review-17-agent-1-database-api.md), [agent-2-route-page](../reviews/2026-09-23-council-review-17-agent-2-route-page.md), [agent-3-ux-shell](../reviews/2026-09-23-council-review-17-agent-3-ux-shell.md), [agent-4-feature-competitive](../reviews/2026-09-23-council-review-17-agent-4-feature-competitive.md).

## Residual risk

- **Recipient/consent binding (pre-existing, not this branch's diff):** `broadcastMessageAction` takes a client-supplied `recipients` array pairing a `recipientProfileId` with a `recipientContact`. The consent lookup stays correctly inside the caller's own church, so there's no cross-tenant leak, but nothing ties the contact to the profile server-side — the consent answer is about whichever profile the client names, not necessarily the address that receives the message. Tracked as **F6**.
- **Delivery webhooks (`lib/communications/webhook-events.ts`) have the same no-user shape as F1 did** — still on the cookie client, so bounce/STOP suppression writes plausibly never land. Not verified this round. Tracked as **F4**, which must land before or with F2 since Resend bounce handling depends on it.
- **Secretary access is inconsistent:** `commRoleAllowed` admits `secretary` at the send-action role gate, but compose/retry/history RLS policies exclude that role. What a secretary should actually be able to do hasn't been decided. Tracked as **F7**.
- **Crons fail open without `CRON_SECRET` outside production.** Not a comparison-timing issue alone — no secret configured means the check is skipped entirely outside `NODE_ENV=production`. Tracked as **F8**, and the comparison itself should also move to constant-time.
- **No production path yet writes a transient `error_code`** (pre-existing, Council Review 16 F2) — Resend is never selected for sending, so the retry pipeline this branch also touches (via `attemptRetry`'s new `temporary_failure` code) still receives no real input in production today.

## Follow-up

- **F2:** Resend wiring + transient-code mapping (now unblocked on the retry path; Agent 4's conditions apply — retries stay on `sendWithSuppression` with `recordLog: false`, Resend selection lives in `queueCommunicationAction`, the unsubscribe footer is kept).
- **F4 (must land before or with F2):** delivery webhooks (`webhook-events.ts`) under ADR 0022.
- **F6:** `broadcastMessageAction` resolves recipients server-side from ids instead of trusting a client-supplied contact/profile pair.
- **F7:** decide and implement consistent secretary access across send/compose/retry/history.
- **F8:** crons fail open without `CRON_SECRET` outside production; use a constant-time compare.
- **F3 (unchanged, carried from Council Review 16):** DLQ visibility — Sentry reporting for swallowed bookkeeping failures, a bookkeeping-failure count feeding the cron's 207, a tooltip on the disabled Retry button, a minimal DLQ view.
- The Council ran on this branch before merge (per `improve-software.md` §0) — this is a security- and compliance-relevant change (a service-role client newly used on a tenant path), not a small isolated fix.
