# Council Review 25 — Agents 2 and 3 (combined): Route & Page, UX & Shell

**Scope:** `test/service-plan-build-journey-g1-11`, commit `1233705` vs `main` (G1.11). Read-only. **Verdict:** merge-worthy with follow-ups.

## 1. New Service Plan form copy (`volunteer-schedule.tsx:546-551`)

"Linked church event (optional)" is now misleading: leaving it blank creates an event, with no helper text or confirmation. The auto-event gets `approval_status = 'draft'` and `visibility = 'members'`; the member portal's upcoming-events query filters on visibility only (`lib/member-portal-data.ts:751-760`), so every new plan, draft included, appears on members' upcoming events. A church with its own recurring Sunday event that isn't picked here gets two. Suggest a description ("Leave blank and we'll create …") and a staff-only visibility.

## 2. Stale client state

- **(High, verified, pre-existing) New shifts get fake ids.** `addAssignedShift` sets `id: crypto.randomUUID()` (`volunteer-schedule.tsx:1350`) because `assignVolunteerAction` returns no shift id (`volunteer-actions.ts:1381`). Remove on a just-assigned volunteer (hand or auto-fill) calls `removeAssignmentAction` with the fake id; it deletes 0 rows and returns ok (no row-count check, `:1403-1408`). The UI drops the volunteer and raises Unfilled while the shift stays in the DB. Remind has the same problem.
- **(Medium, verified) Stale plan event id.** After `ensurePlanEvent` links an event, `detail.plan.eventId` and `detailsForm.eventId` stay empty (`:708`). Saving Plan Details then writes `event_id: null` (`volunteer-actions.ts:486`), and the next assignment makes a second event. The clearable select does the same for new plans.
- **(Low, verified)** Plan edits don't update the auto-event, so the calendar drifts.
- Minor: `addAssignedShift` stamps `eventId: d.plan.eventId` (null for older plans); `handleRemove` adds 1 to Unfilled even for an overfilled position (cosmetic).

## 3. The e2e journey

Strong: DB checks at each step, church-zone date, the Auto-fill-without-reload proof, cleanup of the auto-event and the library row. Gaps: no check of the position row, who was assigned, or that the shifts' `event_id` equals the plan's; an event left behind if the plan insert fails; `audit_log` rows left. Flake risk (inferred): `fullyParallel` with the rotation spec assigning the same seeded Greeters; in some months both specs' dates fall in the same month, so monthly limits could bite.

## 4. Manifest

Accurate; `npm run test:surfaces` OK.

## Top issues

1. (High, verified, pre-existing) Fake shift ids: Remove and Remind on a just-assigned volunteer silently do nothing.
2. (High) The auto-event is visible to members as soon as the plan is created.
3. (Medium) Form copy inaccurate; no confirmation.
4. (Medium) Stale event id plus the clearable select: unlinked event, then a duplicate.
5. (Low) Auto-event not updated when the plan changes.
6. (Low, inferred) Parallel-run flake risk; orphan event on a partial failure.
