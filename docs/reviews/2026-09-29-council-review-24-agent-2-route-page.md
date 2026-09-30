# Council Review 24 — Agent 2: Route & Page

**Scope:** `feat/church-timezone-days-g1-6`, `ad09cab` vs `main`, 11 files. Read-only. `npm run test:surfaces` OK.

## 1. Changed signatures

Every caller passes the church's zone (verified by grep): `expandBlockoutRange`/`validateBlockoutRemoval` (one caller each), all 9 blockout action entry points (self: session zone; admin: `adminBlockoutContext`; token: `volunteerForToken` reads `churches.timezone`), `tokenExpiryFor` → `ensureShiftToken` → `notifyVolunteerOfShift`, `respondToShiftAction`, `getServicePlanList`, `getMemberSchedule`. `todayUtc` is fully removed. The zone parameter is optional in three lib helpers, so a future caller that omits it silently gets UTC (design risk). Minor (inferred): the session zone comes from the membership row, token pages from tenant `churches`; both default to `America/New_York`.

## 2. Do the pages agree on "today"? No — two still compute it in UTC

- **`/portal/volunteer/schedule/[token]` (verified, High):** `getPublicVolunteerScheduleByToken` (`volunteer-actions.ts:2009`) filters `.gte("starts_at", new Date().toISOString())`. A New York church's 10 am shift disappears from the token page at 7 am local, while `/app/member/schedule` keeps it all day; an evening shift drops about 4 hours early. The emailed link is how most volunteers reach this page.
- **`/app/church-admin/volunteers/schedules` (verified, Medium):** the server list uses the church's today, then `volunteer-schedule.tsx:308-309` re-splits in UTC. At 8:30 pm Sunday in New York, Sunday's plan goes under "Past" (`:404`) and the "N upcoming" count (`:368`) drops by one.
- `/schedules/[id]`: no "today" math. `/portal/volunteer/confirm/[token]`: only token expiry; renders in UTC, correct for wall-clock. Pre-existing (inferred Low): `respondToPublicShiftAction` (`:2019`) has no "hasn't happened yet" guard, unlike `respondToShiftAction`.

## 3. Blockout panel

No conflict: no client-side check against today; the start input has no `min`; all past/too-far checks are server-side, now church-local.

## 4. Manifest

Clean; no surfaces added or changed. No test covers `getPublicVolunteerScheduleByToken` or the client split, which is why neither issue was caught.

## Top issues

1. High, verified — `volunteer-actions.ts:2009` token schedule.
2. Medium, verified — `volunteer-schedule.tsx:308-309` client split.
3. Low — optional `timeZone?` parameters; consider required.
4. Low, pre-existing — `respondToPublicShiftAction` has no past-shift guard.
5. Low, verified — `get_volunteer_pool`'s last-served compares `starts_at <= now()`, off by the offset like burnout; worth a line in the ADR.
6. Cosmetic — `lib/blockout-dates.ts:10-11` import splits a doc comment from its constant; `lib/volunteer-data.ts:1` import before `server-only`.
