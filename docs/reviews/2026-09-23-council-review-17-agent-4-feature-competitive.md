# Council Review 17 — Agent 4: Feature & Competitive Audit

**Branch:** `fix/comms-cron-consent-suppression-lookups` (`56247ae`) vs `main` (`0c8d27f`). `npx vitest run lib/communications lib/notifications`: **12 files, 93/93 passed** (the agent ran it).

## 1. Is F1 closed? Mostly: the four stated calls are fixed, but not every path

| Path | Suppression | Consent | Notes |
|---|---|---|---|
| `broadcastMessageAction` (`:104`) | Yes | Yes, but on caller-supplied data | The client supplies `recipients[]`, so a profileId can be paired with any contact. |
| `composeAndSendMessageAction` (`:761`) | Yes | Yes | **The parent insert (~`:745`) still uses the cookie client**, so a secretary's segment send fails before sending anything. The ADR's "Secretary sends do too" holds only for broadcast. |
| Scheduled cron | Yes (now) | Yes (now) | **`resolveRecipients` still uses the cookie client and resolves zero recipients as anon.** Scheduled sends reach nobody today. F1 removes a hazard that would appear the moment the resolver is fixed; there was no active leak. |
| Retry cron | Yes | Yes | Correct now. |
| Donation receipts (`donations-actions.ts:277`, `webhooks/stripe/route.ts:641`) | No | No | Transactional, so CAN-SPAM exempt, but no `communication_logs` row is written. |
| `lib/notifications/send-sms.ts:29` | No | No | No callers. Delete it, or route it through `sendWithSuppression`. |
| Push | n/a | Yes | Already on the admin client. |

## 2. Compliance (CAN-SPAM / TCPA): about 4/10 before, about 6/10 after
Remaining gaps:
- F4: `webhook-events.ts` is still on the cookie client, so bounce and STOP events probably never write suppressions.
- The unsubscribe route ignores the upsert error.
- No STOP/HELP/START keyword handling and no record of opt-in evidence.
- Transactional sends are not logged.
PCO, Breeze and Tithe.ly all ship keyword handling, automatic bounce suppression and a per-member send history.

## 3. Safe to start F2?
Yes, conditionally. Retries must stay on `sendWithSuppression` with `recordLog: false`. Resend selection must live inside `queueCommunicationAction`. The Resend path must keep the unsubscribe footer. F4 and the unsubscribe error check should land first or alongside, because Resend bounces go through the broken webhook resolver.

## 4. Is ADR 0022 sound?
Yes. An admin client scoped by `church_id` is the dominant server-side pattern here (41 files). A SECURITY DEFINER `is_suppressed()` RPC would be worth considering if these lookups multiply. Two amendments:
- Extend the ADR to cover `resolveRecipients` and the compose parent insert.
- Correct the Context section: scheduled broadcasts went to nobody, not to unsubscribed addresses.

## 5. MVP readiness: 68/100, unchanged
Real compliance hardening, but the cron still delivers nothing, secretary compose still fails, and Resend is still unwired.
