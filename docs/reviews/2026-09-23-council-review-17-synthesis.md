# Council Review 17 — Synthesis

**Date:** 2026-09-23
**Branch audited:** `fix/comms-cron-consent-suppression-lookups` (commit `56247ae`)
**Base branch:** `main` (`0c8d27f`, the PR #148 merge)
**Scope:** Diff-scoped. Follow-up F1 from Council Review 16: the suppression/consent lookups and `communication_logs` writes move to the admin client, scoped by `church_id` from the server-side session (ADR 0022).

## §0 Scope Note

This is a fresh single-commit branch. It is a security- and compliance-relevant change: a service-role client is now used on a tenant path. That rules out the small-isolated-fix exception, so a full Council pass was run, diff-scoped as in Reviews 13–16.

## 1. Cross-Agent Consensus

- **All four agents agree the four changed calls are correctly tenant-scoped.** `church_id` always comes from the server-side session or a DB row, never from client input (Agent 1 traced every caller). Agent 4 confirms that the ADR 0022 pattern is the repo's dominant server-side pattern (41 files).
- **Agents 1, 3 and 4 independently found that the scheduled cron resolves zero recipients on Supabase.** `resolveRecipients` (`recipient-resolver.ts:26`) is still on the cookie client, and every `profiles` select policy is `to authenticated`. So scheduled broadcasts go to nobody and are marked `sent`.
- **Agents 2, 3 and 4 found that `writeSuppressedLog` ignores `recordLog: false`.** Now that the cron can see suppressions, a suppressed retry writes a duplicate `suppressed` row on each attempt, up to 3.
- **Agents 1, 2 and 3 found that the interactive send loops have no per-recipient catch** (`communications-actions.ts:97-118, 759-769`). A consent-read throw can now stop a bulk send partway through. The counts for recipients already sent are lost, and the compose parent row stays `queued`.
- **Agents 1, 2 and 4 found that `broadcastMessageAction` trusts a client-supplied `recipients` array.** The consent answer is about whichever profile the client names, not the address that receives the message. This is pre-existing.
- **Agents 2 and 4 found that secretary compose fails** at the cookie-client parent insert (`communications-actions.ts:~730-751`). This is pre-existing.
- **Agents 3 and 4 found that the unsubscribe route ignores its upsert `error`** (`app/api/unsubscribe/route.ts:56-70`). A member can see "unsubscribed successfully" when nothing was stored.

## 2. Corrections and verifications during synthesis

1. **Our own ADR 0022 and commit `56247ae` were wrong about the scheduled cron.** They said scheduled broadcasts "reached unsubscribed and bounced addresses". Verified in source (`recipient-resolver.ts:26`, `profiles` select policies all `to authenticated`): the cron resolves no recipients, so it sent to **nobody** and marked the broadcast `sent`. That is a silent delivery failure, not a compliance leak. F1 as committed fixes the **retry cron and secretary sends**, not scheduled broadcasts. This is the second round in a row where the inaccuracy came from our own write-up, not from an agent (see Council Review 16 §2 item 1).
2. **Agent 1: "`queueCommunicationAction` is a public server action that trusts a caller-supplied `session`." Verified, HIGH.** `lib/notifications/queue-communication.ts:1` is `"use server"`. `.next/server/server-reference-manifest.json` registers `queueCommunicationAction` on 6 pages, and its only importers are server modules (`send-with-suppression.ts`, `retry-eligible.ts`). Next.js IDs are encrypted and rotate per build, and unused actions are left out of the client bundle (`node_modules/next/dist/docs/01-app/02-guides/data-security.md:281-291`). So exploiting this needs a leaked ID, but the docs still say to treat every action as reachable and to authenticate inside it. This one doesn't. The exposure is pre-existing (sending through the platform's providers as any church). This branch widens it to forged service-role audit rows.
3. **Found during verification of item 2, outside the diff: the same pattern in `lib/actions/audit.ts`, and worse.** `logAuditEvent` and `pruneAuditLogsAction` are `"use server"` exports that write with the admin client and have **no authentication**. Both are registered in the manifest (5 pages each). `pruneAuditLogsAction` has no callers at all and invokes the SECURITY DEFINER `prune_audit_logs(retention_days)`, which deletes from `audit_log` **across all churches**. A caller holding the ID could erase every tenant's audit trail. The ID-secrecy caveat from item 2 applies.
4. `lib/actions/erasure.ts` and `lib/compliance/data-rights-actions.ts` were checked too. Both authenticate with `requireChurchSession` plus a role check, so they are fine.

## 3. ADR Assessment

ADR 0022 stands, but must be **amended in this branch**:
- Correct the Context section per §2 item 1.
- Extend it to `resolveRecipients` and the compose parent insert if P2 below is approved.
- Add the rule this review surfaced: **modules that take a trusted `session` or tenant ids as arguments must be `server-only`, never `"use server"`.**

## 4. Implementation Prompts

### In this branch (proposed; needs human approval)

- **P1 (security, required before merge):**
  - `lib/notifications/queue-communication.ts` and `lib/actions/audit.ts`: replace `"use server"` with `import "server-only"`.
  - Delete the unused `pruneAuditLogsAction`. If retention is wanted later, it should be a cron with a secret, not an action. *(Executed differently: it was kept as `server-only` rather than deleted. ADR 0012 intends pruning via `pg_cron`, and the function has its own test. `server-only` closes the external path either way.)*
  - Verify with the build (a client import would fail it) and the manifest (the actions no longer listed).
- **P2 (scheduled broadcasts actually deliver):**
  - `resolveRecipients` and the compose parent-log insert move to the admin client under ADR 0022.
  - The scheduled cron stops marking a broadcast `sent` when no recipient was delivered.
  - **Behavior change:** scheduled broadcasts will start reaching people, SMS included (billed by Twilio).
- **P3 (honest partial failure):**
  - Per-recipient `try/catch` in `broadcastMessageAction` and `composeAndSendMessageAction`, returning honest sent/skipped/error counts.
  - `writeSuppressedLog` honours `recordLog: false`.
  - A thrown dispatch or lookup error in `attemptRetry` is recorded with a transient code, so a brief consent-read failure retries within budget instead of dead-lettering at once.
- **P4 (small hardening):**
  - Escape `%`/`_` in `findSuppression`'s `ilike`.
  - The unsubscribe route checks the upsert `error` and reports failure honestly.
  - Delete dead `lib/notifications/send-sms.ts`.
  - Correct ADR 0022 (§3).

### Follow-ups (separate branches)

- **F2:** Resend wiring and transient-code mapping. Now unblocked on the retry path, with Agent 4's conditions: retries stay on `sendWithSuppression` with `recordLog: false`, Resend selection lives in `queueCommunicationAction`, and the footer is kept.
- **F4:** delivery webhooks (`webhook-events.ts`) under ADR 0022. This should land **before or with F2**, because bounce and STOP suppression depends on it.
- **F6:** `broadcastMessageAction` resolves recipients on the server from ids instead of trusting a client-supplied contact/profile pair.
- **F7:** secretary access consistency. `commRoleAllowed` admits secretary, but compose, retry and history RLS exclude them. Decide what a secretary should be able to do.
- **F8:** crons fail open without `CRON_SECRET` outside production; use a constant-time compare.
- **F3** (unchanged): DLQ visibility.

## 5. MVP Readiness

**68/100, unchanged** (Agent 4). If P2 is approved, scheduled broadcasts become a working feature for the first time on Supabase. That, plus F2, is where the expected +1–2 comes from.

## 6. Agent Reports

- [agent-1-database-api](2026-09-23-council-review-17-agent-1-database-api.md)
- [agent-2-route-page](2026-09-23-council-review-17-agent-2-route-page.md)
- [agent-3-ux-shell](2026-09-23-council-review-17-agent-3-ux-shell.md)
- [agent-4-feature-competitive](2026-09-23-council-review-17-agent-4-feature-competitive.md)

## §7 Execution & Documenter sign-off

The human approved P1–P4. All four landed in commit `6e005d4`:

- **P1:** `lib/notifications/queue-communication.ts` and `lib/actions/audit.ts` are now `import "server-only"` instead of `"use server"`. `pruneAuditLogsAction` was kept rather than deleted — ADR 0012's `pg_cron` retention lineage, and the function already has its own test; `server-only` closes the external HTTP path either way, per the implementation note in §4.
- **P2:** `resolveRecipients` and `composeAndSendMessageAction`'s parent-log insert/close-out moved to the admin client under ADR 0022. Scheduled broadcasts now actually deliver on Supabase for the first time, SMS included (Twilio-billed); the cron marks a broadcast `failed`/`no_delivery` instead of `sent` when nobody was delivered; compose closes out its parent row (previously left `queued` indefinitely) and returns honest counts.
- **P3:** per-recipient `try`/`catch` with honest sent/skipped/error counts in `broadcastMessageAction` and `composeAndSendMessageAction`; `writeSuppressedLog` honours `recordLog: false`; a thrown retry dispatch/lookup is recorded as `temporary_failure` (retries within budget) instead of dead-lettering immediately.
- **P4:** the unsubscribe route checks its upsert `error`; `findSuppression`'s `ilike` escapes `%`/`_`; dead `lib/notifications/send-sms.ts` deleted; ADR 0022 corrected per §2 item 1.

**Verification (independently re-run by the Documenter, not just taken from the implementation commit):**

- `npx tsc --noEmit`: clean.
- `npx vitest run`: **1629/1629 passed**, 135 test files.
- `npm run lint`: 0 errors, 7 pre-existing unrelated warnings (unchanged baseline).
- `npm run build`: clean.
- Manifest check: `grep -o` for `queueCommunicationAction` / `logAuditEvent` / `pruneAuditLogsAction` against `.next/server/server-reference-manifest.json` after a fresh build returns no matches — all three are gone from the server-action surface.
- Source check on the ADR's new rule: the two remaining `"use server"` exports under `lib/` (`lib/actions/erasure.ts`, `lib/compliance/data-rights-actions.ts`) both call `requireChurchSession` before doing anything else, so they correctly stay `"use server"` per §3's rule.

**Sign-off:** F1 (Council Review 16) and P1–P4 (Council Review 17) are documented, verified, and ready to merge from the Documenter's side. `CHANGELOG.md`, `DEVELOPMENT_PLAN.md`, `README.md`, ADR 0022, this synthesis, and the prior factory-run doc's F1 entry are all updated to match what's actually in `6e005d4`. Open follow-ups (F2, F3, F4, F6, F7, F8) are carried forward, not silently dropped, with F4 flagged as needing to land before or with F2.
