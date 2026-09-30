# Council Review 24 — Agent 1: Database & API

**Scope:** `feat/church-timezone-days-g1-6`, commit `ad09cab` vs `main` (G1.6, church-timezone days). Read-only; local DB selects and a probe of `lib/church-time.ts`.

## 1. ADR 0023's central claim — holds, with caveats

Writers that use wall-clock with no offset: `shiftWindowForPlan` (`lib/rotation-planner.ts:192-203`; client assign paths `volunteer-schedule.tsx:1323/1390/1421` and server auto-fill `volunteer-actions.ts:2164`), the seed (`date + time '10:00'`), the e2e fixtures. Local DB: 7 shifts, all at 10:00 or 09:30 UTC. Session `TimeZone` is `UTC`. The only real-instant writer is the onboarding hydrate (`onboarding/actions.ts:113`), which inserts non-existent columns (`profile_id`, `role`), so it's dead. Caveats: `assignVolunteerAction` trusts the client's `startsAt` (a value with an offset would be stored as a real instant, and the conflict check uses `input.startsAt.slice(0,10)`); `date + time` → `timestamptz` and `get_volunteer_pool`'s `starts_at::date` depend on the session `TimeZone` being UTC, which nothing pins.

## 2. Remaining UTC "today/now" comparisons

| file:line | comparison | wrong under the convention? |
|---|---|---|
| `volunteer-actions.ts:2009` `getPublicVolunteerScheduleByToken` | `.gte("starts_at", new Date().toISOString())` | **Yes** — the bug fixed in `getMemberSchedule`, left in the emailed-link schedule |
| `volunteer-schedule.tsx:308-309` | client re-split on `new Date().toISOString().slice(0,10)` | **Yes** — overrides the server fix |
| `migrations/20260926000000…:170` | `vs.starts_at <= now()` (last served) | Yes, minor |
| `volunteer-data.ts:584` | `p_year: new Date().getFullYear()` | Minor, New Year's Eve edge |
| `volunteer-data.ts:49, 674` | `current_date` | Local dual-path only (deprecated) |
| `burnout-calculator.ts:20` | `new Date(targetStartsAt)` | Shift-to-shift, not `now()`; correct only on UTC servers. **The ADR's "counts from now()" is inaccurate.** |
| `volunteer-actions.ts:1966`, `schedule/[token]/page.tsx:68` | token expiry vs `now()` | Correct (instant vs instant) |

## 3. `lib/church-time.ts` (19 zone/day probes)

Correct for Kolkata (+5:30), Kathmandu (+5:45), Adelaide DST both ways, Chatham, Kiritimati (+14), Etc/GMT+12, New York and London DST days, Beirut. **Wrong on days when DST jumps at midnight**: America/Santiago 2026-09-06 and America/Havana 2026-03-08 return 23:00 the previous day (the two-pass fix-up oscillates). A malformed day now throws `RangeError` in `tokenExpiryFor`, making its `Number.isNaN` guard dead. An invalid zone silently falls back to UTC, and the settings action accepts any string up to 80 characters, so "Eastern" makes G1.6 a no-op.

## 4. Wall-clock vs real instants

`tokenExpiryFor` → `startOfDayInTimeZone`, `getMemberSchedule`, `respondToShiftAction` and the token expiry check are all correct. The one real mix left is `:2009`.

## 5. Tests

The respond, blockout and `tokenExpiryFor` unit tests fail on a UTC revert. The e2e expiry expectation mirrors the implementation in SQL. **No test covers `getServicePlanList`, `getMemberSchedule`, the client split or the token schedule**; no test sets an evening clock for a UTC−4 church end to end; none covers a midnight-DST or non-hour zone.

## Top 5

1. `volunteer-actions.ts:2009`: the emailed-link schedule drops a 10 am shift at 6 am local and an 8 pm service at 4 pm (verified).
2. `volunteer-schedule.tsx:308-309`: after 8 pm EDT tonight's service moves to "Past" (verified).
3. Three of the five fixed paths have no regression test (verified).
4. `church-time.ts:66-68`: 1 h early on midnight-DST days; a malformed day throws (verified by probe).
5. The convention isn't enforced at the write: `assignVolunteerAction` accepts the client's `startsAt`; burnout depends on the server's Node TZ; an invalid `churches.timezone` silently becomes UTC; the ADR misdescribes burnout (inferred risk). Minor: `volunteer-data.ts:1` import above `import "server-only"`.
