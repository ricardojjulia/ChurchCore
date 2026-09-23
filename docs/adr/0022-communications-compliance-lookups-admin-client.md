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
   - Suppression reads as "not suppressed", so **scheduled broadcasts are sent to unsubscribed and bounced addresses**.
   - Consent reads as "no preferences row", which falls back to email-on / SMS-off. **Email opt-outs are ignored, and SMS is never sent.**
   - The log insert is rejected. `writeLog` discarded the error, so the audit row was silently lost.
2. **Roles that may send can sit outside the read policies.** `secretary` passes the send actions' role gate (`app/app/communications-actions.ts`), but `can_manage_church` covers only church_admin / pastor / ministry_leader. A secretary's send therefore reads suppression as "none" and consent as defaults, and cannot insert its own audit row.
3. **The consent select policy is own-row-or-manager**, so for any non-manager sender the recipient's consent row is invisible.

Suppression and consent are compliance controls (CAN-SPAM / TCPA unsubscribe and opt-in obligations). Their answer must be the same no matter who, or what, is sending.

## Decision

1. `findSuppression`, `checkOptIn`, `writeLog`, and `writeSuppressedLog` use `createTenantAdminClient()` (service role) on the Supabase path.
2. **Tenant scoping is explicit and comes from the server.** Every query and insert filters or sets `church_id` from `session.appContext.church.id`, never from client input. The admin client reads only the rows needed to answer a yes/no compliance question for one recipient in that church, and returns no row data to the caller.
3. **Authorization to send stays where it was:** the role gates in the send actions and the cron secrets. This ADR changes *how the compliance checks read data*, not *who may send*.
4. **Failure behavior:**
   - A failed consent read throws, so the check fails closed. An unreadable consent record is not consent. This matches `findSuppression`, which already threw on a read error.
   - A failed audit-log insert is logged with `console.error` and not thrown. By then the message may already have gone out, and a throw would read as a failed send to callers that retry.

## Consequences

- Scheduled broadcasts and retries honour suppression and consent. Secretary sends do too.
- Audit rows are written for cron and secretary sends.
- The service-role client is used on one more tenant path, so the explicit `church_id` filter is the tenant boundary for these four calls. Any new query in this path must keep that filter. Tests assert it for the lookups.
- A missing `SUPABASE_SERVICE_ROLE_KEY` now fails these sends, where before they silently skipped the checks. That's intended.
- **Not covered here:** delivery-webhook log resolution (`lib/communications/webhook-events.ts`) has the same no-user shape. It is tracked separately as follow-up F4, to be verified and fixed under this same rule.
