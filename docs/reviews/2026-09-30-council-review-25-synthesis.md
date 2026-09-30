# Council Review 25 — Synthesis

**Date:** 2026-09-30
**Branch audited:** `test/service-plan-build-journey-g1-11`, commit `1233705`
**Base branch:** `main` (`94f49cf`)
**Roadmap item:** G1.11, service-planning build journey (Gap 1's CI-journey clause)

## §0 Scope Note

Diff-scoped. Three agents ran: Database & API; Route & Page combined with UX & Shell; Feature & Competitive. For a change of this size, the route and UX audits were combined into one agent, and its report says so.

The journey (a plan built from scratch, songs, positions, hand assignment, auto-fill) found two bugs, which are fixed on the branch:
- A plan saved without a linked event could never be staffed. It now gets its own event: at creation, or, for an older plan, on its first assignment. This is the owner's 2026-09-30 decision, pulling G1.8's first half forward.
- Adding a position didn't raise the Unfilled count.

Agent 1 briefly created and deleted a probe file in `lib/`, breaking the read-only rule. The working tree was confirmed clean afterwards.

## 1. Cross-Agent Consensus

- **The two fixes are correct (all three).** RLS matches the write gate for every role, the constraints pass, `created_by` is the church profile id, and the race guard is sound. Every Gap 1 journey clause is now covered across the two specs (Agent 4's map).
- **Auto-created events are visible to members, with RSVP on (all three; verified by me).** `createPlanEvent` inserts no `visibility` or `rsvp_enabled`, so the defaults apply: `members` and `true`. The member calendar and upcoming-events loaders filter on visibility only. Every plan saved without an event, drafts included, shows up for members as an RSVP-able event, and duplicates the church's own Sunday event if one exists.
- **Plan edits and the event drift apart (Agents 1 and 2–3).** After an older plan gets its event, the page's `detail.plan.eventId` stays empty. Saving Plan Details, or clearing the clearable select, writes `event_id: null`, and the next assignment creates a second event. The plan's shifts then span two events. A renamed or re-dated plan doesn't move its event.

## 2. Single-agent findings, verified during synthesis

1. **A volunteer assigned on the page can't be removed or reminded until reload (Agents 2–3, pre-existing).** Verified: `addAssignedShift` gives the new shift `crypto.randomUUID()`, because `assignVolunteerAction` returns no shift id. `removeAssignmentAction` then deletes 0 rows and still returns ok, since it has no row-count check. The UI drops the volunteer and raises Unfilled while the shift stays in the database. Remind has the same problem. It sits right on the journey's path.
2. **Orphaned events (Agent 1).** Verified: the event is inserted before the plan, and a failed plan insert leaves it behind. The loser of an assignment race leaves its event behind too. Both are members-visible under the defaults.
3. **`zonedTimeToInstant` accepts impossible dates and times (Agent 1).** Verified: `2026-02-30` and `25:99` roll over rather than being refused.

## 3. Corrections

- **Our own form copy is now wrong** (Agents 2–3). "Linked church event (optional)" no longer means "no event". Seventh consecutive round with an error in our own work, this time introduced by the fix itself.
- No agent claim was found wrong.

## 4. Score

**72/100** (Agent 4; accepted), up from 71: the new-plan path works and is journey-tested. Volunteer Scheduling ~90%. Deliveries still depend on G5.1.

## 5. Proposed prompts (fix before merge)

- **P1 — Staff-only auto-events.** `createPlanEvent` sets `visibility: "leaders"` and `rsvp_enabled: false`. The New Plan form's event field says: "Leave blank to create a staff-only event for this service."
- **P2 — No orphans.**
  - If the plan insert fails, its new event is deleted.
  - The loser of an assignment race deletes its own event.
  - `zonedTimeToInstant` refuses impossible dates and times.
- **P3 — Real shift ids.**
  - `assignVolunteerAction` returns the new shift's id, and the page and auto-fill use it.
  - `removeAssignmentAction` checks its row count and says so when nothing was removed.
- **P4 — Keep the plan's event.**
  - The assignment result carries the plan's event id, so the page and the details form know it.
  - Saving Plan Details with the event cleared keeps the current event rather than unlinking it; choosing another event still relinks.
- **P5 — Tests.**
  - The journey checks that the shifts' `event_id` equals the plan's, the position's quantity, and that Remove on a just-assigned volunteer really removes the shift.
  - Unit tests for the lost race, a failed plan insert, row-count removal, and malformed times.

## 6. Tracker changes (not fixed here)

- **Plan edits don't update the plan's event** (name, date, time). Moves to §0.5 with G1.8's deferred half.
- **Auto-fill notifications have no journey coverage** (Agent 4). Folded into R1's Testing Council run.
- **Parallel-run flake risk** (Agents 2–3): the build and rotation specs share seeded volunteers. Watched in CI (`failOnFlakyTests`); a finding becomes a row.
