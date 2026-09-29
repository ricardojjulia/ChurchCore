# ADR 0023 — Volunteer Shift Times Are Church Wall-Clock; "Today" Is the Church's Today

**Status:** Accepted
**Date:** 2026-09-29
**Authors:** G1.6 (FS3-4, Council Review 19)

---

## Context

`volunteer_shifts.starts_at` and `ends_at` are `timestamptz`, but every live path writes them as the church's **local wall-clock time with no offset**:

- `shiftWindowForPlan()` (`lib/rotation-planner.ts`) produces `2026-10-06T20:00:00` for an 8 pm service, and Postgres stores that as 20:00 UTC.
- The seed and the e2e fixtures build shift times as `service_date + time '10:00'`, the same way.
- The member schedule (`components/application/member-schedule.tsx`) displays shift times with `timeZone: "UTC"`, so the stored clock reads back as the local time.

So a shift's UTC date is its local calendar day, and the day comparisons that stay within shift data are consistent. That covers the same-day conflict check, `get_volunteer_pool()`'s `serving_on_date`, the 30-day load, the month count and blocked dates.

What was wrong (Council Review 19, FS3-4) was every comparison against **"today" or "now"**, which was computed in UTC. For a church at UTC−4, UTC reaches tomorrow at 8 pm local, so for the rest of the evening:

- a member couldn't answer for that evening's service;
- they couldn't mark that evening off;
- the service dropped off their schedule hours before it started (the schedule compared the wall-clock `starts_at` with the real current instant);
- the upcoming/past plan split and confirm-link expiry were off by the offset.

## Decision

1. **Keep the wall-clock convention for volunteer shifts.** Converting every shift to a true instant would touch every display of a shift and need a data migration of existing rows. That doesn't fit G1.6's half-day estimate or the MVP's zero buffer (owner decision, 2026-09-29).
2. **"Today" is the church's today.** `lib/church-time.ts` provides:
   - `todayInTimeZone(churches.timezone)`;
   - `startOfDayInTimeZone(day, zone)`, the real instant a local day begins.

   The session carries `appContext.church.timezone`. Token-based pages look it up from `churches`.
3. **Compare like with like.**
   - Against a shift time (wall-clock), use the church's today as a wall-clock label: `${todayInTimeZone(tz)}T00:00:00`.
   - Against a real instant (`now()`, `confirmation_token_expires_at`), use `startOfDayInTimeZone`.
   - Plain `date` columns (`service_date`, `blocked_date`) compare with `todayInTimeZone(tz)`.

Applied in G1.6 to:

- the member's shift response;
- adding, removing and listing blockout dates (member, token link, admin);
- the member schedule;
- the upcoming/past service-plan split;
- the confirm-link expiry.

## Consequences

- An evening service at a UTC−4 church stays on its own day, all evening, everywhere the volunteer or admin sees it.
- **Any new code writing a shift time must write local wall-clock without an offset.** Any new code reading one must either display it in UTC or treat it as local. Mixing a shift time with a real instant (e.g. `events.starts_at`, `now()`) needs one side converted first.
- `lib/burnout-calculator.ts` counts the last 30 days from `now()` against wall-clock shift times, so it's off by the church's offset (hours in a 30-day window). Accepted as negligible.
- **Deferred after MVP:** converting shift times to true instants (a data migration, `shiftWindowForPlan` writing offsets, displays in the church zone), which would remove the convention. Recorded in `DEVELOPMENT_PLAN.md` §0.5.
