# Council Review 25 — Agent 1: Database & API

**Scope:** `test/service-plan-build-journey-g1-11`, commit `1233705` vs `main` (G1.11). Read-only except one short-lived probe file this agent created in `lib/` and deleted at once (a breach of the read-only rule; the working tree was confirmed clean afterwards). Local DB selects.

## 1. RLS and schema (verified)

- `events_manage_management_scope`, `service_plans_manage` and `volunteer_shifts_manage_management_scope` are all `ALL` policies on `can_manage_church(church_id)`, which allows church_admin, pastor and ministry_leader (and platform admins). They match the gate (`canManageServicePlans`) exactly. No role passes the gate and fails the insert. Only church-admin is exercised end to end.
- `category: "worship"` passes the check. `visibility` defaults to `members`, `approval_status` to `draft`. `ends_at = starts_at + 2h` passes `events_check`. `created_by` is the church profile id (correct under S7) and nullable.
- **Side effect:** `rsvp_enabled` defaults to true, and `lib/church-calendar-data.ts` filters on visibility only, so every auto-created plan event shows on the member calendar with RSVP on, and may duplicate an unlinked "Sunday Worship" event.

## 2. `zonedTimeToInstant` (verified by running it)

Correct for New York EDT/EST, Kolkata, Kathmandu, Lord Howe DST, and fall-back 01:30 (first occurrence). A non-existent time maps to the earlier offset (low severity). **Malformed input isn't fully rejected:** `2026-02-30` rolls over to Mar 2 and `25:99` is accepted.

## 3. Concurrency (verified from the code)

Two event-less assignments at once each create an event. `.is("event_id", null)` lets only one link; the loser re-reads and uses the winner's, so shifts never reference the unlinked one. **But the loser's event is never deleted**, and `createServicePlanAction` leaves its event behind when the plan insert fails.

## 4. Other paths

Auto-fill goes through `assignVolunteerAction`. The local fallback branches still insert null events but are dead code. 0 local plans have a null `event_id`. **New gap:** `updateServicePlanDetailsAction` writes `event_id: linkedEvent.eventId`, null when the Select is cleared, and never updates the event.

## 5. Tests

`plan-event-actions.test.ts` would catch a missing event, a login-id `created_by`, a lost link, a removed guard, or a wrong shift event. Not covered: the lost race, a failed event insert, the orphan on plan-insert failure, DST or rollover for `zonedTimeToInstant`, other roles. The e2e never asserts the shifts' `event_id` equals the plan's.

## Top 5

1. Orphaned events on a failed plan insert or a lost race (verified).
2. Plan edits don't reach the event; clearing the Select unlinks it and the next assignment creates a second event (verified).
3. Draft auto-events visible to members with RSVP on (verified by code). Fix: `visibility: "leaders"`, `rsvp_enabled: false`.
4. Weak input validation in `zonedTimeToInstant` (verified).
5. Test gaps (section 5).
