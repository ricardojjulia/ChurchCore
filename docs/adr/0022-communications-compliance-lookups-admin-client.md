# ADR 0022 — Communications Compliance Lookups and Audit Writes Use the Admin Client

**Status:** Accepted
**Date:** 2026-09-23
**Authors:** Follow-up F1 from Council Review 16

---

## Context

Every outbound message goes through `sendWithSuppression` → `queueCommunicationAction`. Along the way, that path makes three data calls that decide whether a message may go out and record what happened:

- `findSuppression` reads `communication_suppressions`: is this address unsubscribed, bounced, or manually suppressed?
- `checkOptIn` reads `notification_preferences`: has the member opted in to this channel?
- `writeLog` / `writeSuppressedLog` insert into `communication_logs`, the audit trail.

All three used `createTenantServerClient()`, the cookie-bound client that runs as the caller. So their results depended on the caller's RLS visibility, and in three cases that visibility is wrong:

1. **Crons have no user.** `communications-scheduled` and the retry cron call the path with a synthetic session and no cookies, so the queries run as `anon`. The select policies are `to authenticated`, so every lookup returns nothing:
   - Suppression reads as "not suppressed" and consent falls back to email-on / SMS-off.
   - The log insert is rejected, and `writeLog` discarded that error.
   - **On the scheduled cron this never actually reached a recipient.** `resolveRecipients` also ran as `anon` and returned nobody, so scheduled broadcasts went to no one and were then marked `sent`.
   - *(Corrected by Council Review 17. This ADR's first draft said scheduled broadcasts reached unsubscribed addresses; they reached no one.)*
   - On the retry cron, the missing checks were real, but that path had no production input yet (Council Review 16).
2. **Roles that may send can sit outside the read policies.** `secretary` passes the send actions' role gate (`app/app/communications-actions.ts`), but `can_manage_church` covers only church_admin / pastor / ministry_leader. A secretary's send therefore reads suppression as "none" and consent as defaults, and cannot insert its own audit row.
3. **The consent select policy is own-row-or-manager**, so for any non-manager sender the recipient's consent row is invisible.

Suppression and consent are compliance controls (CAN-SPAM / TCPA unsubscribe and opt-in obligations). Their answer must be the same no matter who, or what, is sending.

## Decision

1. `findSuppression`, `checkOptIn`, `writeLog`, `writeSuppressedLog`, `resolveRecipients`, and `composeAndSendMessageAction`'s parent-log insert and close-out use `createTenantAdminClient()` (service role) on the Supabase path.
2. **Tenant scoping is explicit and comes from the server.** Every query and insert filters or sets `church_id` from `session.appContext.church.id`, never from client input. The admin client reads only the rows needed to answer a yes/no compliance question for one recipient in that church, and returns no row data to the caller.
3. **Modules that take a trusted `session` or tenant ids as arguments are `import "server-only"`, never `"use server"`.** A `"use server"` export is a POST-callable endpoint (Next.js `data-security.md`: "treat Server Actions as reachable via direct POST requests"). A caller holding its ID could then pass a forged session for any church, and with the admin client in the path that means forged service-role writes. Council Review 17 found three such exports: `queueCommunicationAction`, plus `logAuditEvent` and `pruneAuditLogsAction` in `lib/actions/audit.ts`. The last one deletes `audit_log` rows across every church, and none of the three authenticated. All three are now `server-only`. Only a module whose exports authenticate their own caller (`requireChurchSession` plus a role check) may be `"use server"`.
4. **Authorization to send stays where it was:** the role gates in the send actions and the cron secrets. This ADR changes *how the compliance checks read data*, not *who may send*.
5. **Failure behavior:**
   - A failed consent read throws, so the check fails closed. An unreadable consent record is not consent. This matches `findSuppression`, which already threw on a read error.
   - A failed audit-log insert is logged with `console.error` and not thrown. By then the message may already have gone out, and a throw would read as a failed send to callers that retry.

## Consequences

- Scheduled broadcasts now actually reach their segment on Supabase, for the first time (SMS included, which Twilio bills). They honour suppression and consent, and the cron marks a broadcast `failed` (`no_delivery`) instead of `sent` when nobody was delivered.
- Retries and secretary sends honour suppression and consent, and a secretary's compose no longer fails at the parent insert.
- Audit rows are written for cron and secretary sends.
- The service-role client is used on one more tenant path, so the explicit `church_id` filter is the tenant boundary for every call listed in Decision 1. Any new query in this path must keep that filter. Tests assert it for the lookups and the compose insert.
- A missing `SUPABASE_SERVICE_ROLE_KEY` now fails these sends, where before they silently skipped the checks. That's intended.
- **Not covered here:** delivery-webhook log resolution (`lib/communications/webhook-events.ts`) has the same no-user shape. It is tracked separately as follow-up F4, to be verified and fixed under this same rule.

## Later applications of this pattern

The scoped-admin-client-plus-server-side-check shape (Decision 1–2) has since been reused outside communications, for the same reason: RLS alone either doesn't grant the write, or would have to trust client input to enforce a business rule:

- **S7 (Council Review 21, 2026-09-28):** `respondToShiftAction` (a member confirming or declining their own volunteer shift) — members have no UPDATE policy on `volunteer_shifts`, so a direct client update matched zero rows while reporting success. Moved to a scoped admin client with a row-count check.
- **S8 (Council Review 22, 2026-09-29):** member-reachable business-rule writes that RLS gives members no INSERT/UPDATE for — donations, mobile check-in (`attendance`), group join (`group_members`), event-registration capacity and payments. Each write is scoped by `church_id` and `session.churchProfileId` from the server, after the action's own checks (visibility, capacity, deadline, RSVP-enabled, etc.), never from client input. A member-JWT DB harness (`tests/database/member-writes-rls.test.ts`) proves the underlying tables still deny a member's direct write — the admin client enforces the business rule the RLS policy can't express, it doesn't relax RLS. The one case fixed with an actual RLS policy change instead, because the fix was expressible as one, is `event_rsvps` (the self policy compared a profile id with `auth.uid()`, not `session.churchProfileId`).
- **G1.5 (Council Review 23, 2026-09-29):** volunteer assignment confirmation tokens (`volunteer_shifts.confirmation_token`). Members have broad SELECT on `volunteer_shifts` (they need to see the roster), but the token is a secret that must not be one of the columns that grant covers. Here the pattern is a **column-level grant**, not a table-level RLS policy: migration `20260929010000` revokes table-wide SELECT from `authenticated` and re-grants SELECT on every column except `confirmation_token`; the app reads and writes the token only through the church-scoped admin client, with a row-count check on the write. **Caveat:** because this is a column grant, not a row policy, a column added to `volunteer_shifts` later is invisible to `authenticated` until it is added to the grant list in that migration — unlike a table-level RLS policy, a new column doesn't inherit visibility automatically.

**Related but distinct rule:** ADR 0024 (S9, Council Review 26) covers the mirror-image failure at the database-function layer — a `SECURITY DEFINER` function (which, like the admin client, runs with elevated privilege) must take its actor from `auth.uid()`, never a caller-supplied argument. `merge_duplicate_profile` had trusted an `actor_profile_id` argument instead, a live privilege escalation.
