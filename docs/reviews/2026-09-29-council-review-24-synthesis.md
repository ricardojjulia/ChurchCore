# Council Review 24 — Synthesis

**Date:** 2026-09-29
**Branch audited:** `feat/church-timezone-days-g1-6`, commit `ad09cab`
**Base branch:** `main` (`438fa32`)
**Roadmap item:** G1.6, church-timezone days (FS3-4) (`DEVELOPMENT_PLAN.md` §0.3)

## §0 Scope Note

Diff-scoped, 11 files. G1.6 keeps volunteer shift times as church wall-clock labelled UTC (ADR 0023, new) and moves every "today"/"now" comparison to the church's time zone (`lib/church-time.ts`).

## 1. Cross-Agent Consensus

- **ADR 0023's central claim holds (Agents 1 and 4, verified).** Every live writer of `volunteer_shifts.starts_at` writes wall-clock with no offset. Local data confirms it. Shift-to-shift day math (conflicts, pool, blocked dates) is already local.
- **Every changed signature's callers pass the church's zone (Agent 2, verified).**
- **The emailed-link schedule still compares with the real `now` (Agents 1, 2 and 3; verified by me).** `getPublicVolunteerScheduleByToken` (`app/app/volunteer-actions.ts:2009`) is the same bug G1.6 fixed in `getMemberSchedule`, left on the page most volunteers use. At a UTC−4 church, a 10 am shift vanishes at 6 am local and an 8 pm service at 4 pm, while the signed-in schedule keeps both.
- **The admin plan list re-splits upcoming/past in UTC on the client (Agents 1, 2 and 4; verified by me).** `components/application/volunteer-schedule.tsx:308-309` overrides the server's church-day list. After 8 pm at a UTC−4 church, tonight's plan moves to "Past".
- **Three of the five fixed paths have no regression test (Agents 1, 2 and 4):** `getServicePlanList`, `getMemberSchedule` and the token schedule. The DoD's "evening service in UTC−4" test only covers the response, blockouts and token expiry.

## 2. Single-agent findings, verified during synthesis

1. **`startOfDayInTimeZone` is an hour early on days when DST jumps at midnight (Agent 1, by probe).** Verified by working the Santiago case by hand. That midnight doesn't exist; the second pass takes the post-jump offset and lands at 23:00 the previous day. A malformed day now throws in `tokenExpiryFor` where it used to fall back (the `Number.isNaN` guard is dead). Low impact: confirm-link expiry in those zones.
2. **The convention isn't enforced where shifts are written (Agent 1).** Verified: `assignVolunteerAction` stores the client's `startsAt`/`endsAt` as sent. An offset-bearing value would be stored as a real instant. An invalid `churches.timezone` (the settings action accepts any string) silently becomes UTC.
3. **The ADR misdescribes burnout, and omits last-served (Agents 1 and 2).** Verified: `lib/burnout-calculator.ts` counts 30 days back from the target shift, not from `now()`. It's wall-clock vs wall-clock, correct on a UTC server clock. `get_volunteer_pool`'s last-served uses `starts_at <= now()`, off by the offset.
4. **Run-of-service item times display in the browser's zone (Agent 3, pre-existing).** Verified (`volunteer-schedule.tsx:625,627`): items from `datetime-local` inputs are stored like shift times, so after a reload a New York admin sees a 10:00 item as 6:00:00 AM.
5. **Gap 1's CI-journey clause isn't met (Agent 4).** Verified: no e2e builds a plan or adds songs; the rotation spec uses a seeded plan. This is an M1 exit criterion, independent of G1.6.
6. **Answering from the emailed link has no "hasn't happened yet" guard (Agent 2, pre-existing).** Verified: `respondToPublicShiftAction` updates by shift id only, unlike `respondToShiftAction`.

## 3. Corrections

- **Our own ADR 0023 overstated twice.** It listed the member schedule and the plan split as fixed, but the token schedule and the client split weren't. It also said burnout counts from `now()`. Sixth consecutive round with an error in our own write-up.
- **The DoD reads as a code change** ("use `churches.timezone`"). Agent 4 asks for a one-line amendment: the conflict, load and month clauses are met by the wall-clock convention, and only today/now needed converting.
- No agent claim was found wrong.

## 4. Score

**71/100** at merge (Agent 4; accepted), up from 70 once these fixes land. Volunteer Scheduling ~88%. Not higher: deliveries still depend on G5.1, and Gap 1's plan-build/songs journey is open.

## 5. Proposed prompts (fix before merge)

- **P1 — Token schedule.** `getPublicVolunteerScheduleByToken` filters from the church's today in wall-clock form, using the zone `volunteerForToken` already reads. Regression test.
- **P2 — Admin plan split.** The schedules page passes the church's today to the component, which splits on it instead of UTC. Component test at an evening clock.
- **P3 — `church-time` correctness.** On a midnight-DST day, return the first instant that falls on the requested day. A malformed day returns the 7-day minimum again instead of throwing. Tests for Santiago, Havana and Kolkata.
- **P4 — Enforce the convention.**
  - `assignVolunteerAction` derives the shift window on the server from the plan's date and time (`shiftWindowForPlan`), ignoring client times.
  - The church settings action accepts only a valid IANA zone.
  - Tests.
- **P5 — Tests for the fixed loaders.** `getServicePlanList` and `getMemberSchedule` at an evening UTC−4 clock.
- **P6 — Small fixes.**
  - Run-of-service times display wall-clock (`timeZone: "UTC"`).
  - Answering from the emailed link refuses a shift before the church's today, like the signed-in path.
  - Fix the import placement.
- **P7 — Docs.**
  - ADR 0023: correct the burnout paragraph; add last-served to the accepted exceptions; note the DB session-TimeZone dependency.
  - The G1.6 DoD amendment line.

**Separate, for the owner (M1 exit criterion, not G1.6):** P8, a service-plan build + add-songs e2e journey (about 0.25–0.5 day, per Agent 4). It closes Gap 1's CI-journey clause. The alternative is amending the DoD.

## 6. Tracker changes (not fixed here)

- **Converting shift times to true instants** stays deferred, but its §0.5 note says it must land **before** any ICS export, reminder cron keyed to shift times, merged event/shift calendar or Planning Center import (Agent 4).
- **Showing the church's time zone** ("Times are in Eastern time") on the member schedule, portal pages and email footer (Agent 3): §0.5, cheap follow-up.
- Make the `timeZone` parameters required (Agent 2): folded into S9's regression guards.
- Event picker labels in the browser's zone (Agent 3), and the New Year's Eve `p_year` edge (Agent 1): §0.5, minor.

## 8. Addendum — found by CI after the review (2026-09-30)

The PR's first CI run failed the S8 RSVP journey on shard 1. It was a real bug, not a flake:
- **Cause:** the calendar's month and week grids built each cell as `new Date(year, month, day)`, midnight in the *viewer's* browser zone, then read which church day that instant falls on.
- **Effect:** for a viewer east of the church (CI's browser runs in UTC; the church is in New York), that's the previous church day. Every event sat one cell late, and the last day of the month's events vanished. It showed on Sep 30, the month's last day.
- **Fix:** cells are church calendar days anchored at church-local noon (`churchDayAnchor`, `dayKeyFromParts` in `lib/calendar-utils.ts`).
- **Proof:** a regression test puts the church in Honolulu, west of any test machine. It fails on the old code and passes on the new.

It's the same class of bug as G1.6 (a day computed in the wrong zone), in the calendar rather than volunteer scheduling. All four agents missed it, because it lives outside the diff.

