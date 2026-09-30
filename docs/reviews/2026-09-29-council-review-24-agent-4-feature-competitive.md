# Council Review 24 — Agent 4: Feature & Competitive

**Scope:** `feat/church-timezone-days-g1-6`, `ad09cab` vs `main`. Read-only; local DB selects only.

## 1. G1.6 definition of done

| Clause | Verdict | Evidence |
|---|---|---|
| Same-day conflicts use church tz | Done (by convention) | wall-clock shift times compared with wall-clock (`volunteer-actions.ts:1297-1307`, pool `starts_at::date = p_service_date`) |
| Blockout dates | Done | church today on all three paths; unit test shows the UTC−4 evening accepted, UTC rejected |
| 30-day load, month counts | Done (by convention) | the pool compares with `p_service_date`, no "now"; depends silently on DB `TimeZone = UTC` |
| Test: evening service in UTC−4 on the right day | **Partial** | response cut-off, blockouts, `todayInTimeZone`, token expiry covered; no test for an evening service's conflict, pool or plan-list day |

The ADR's argument is sound, but the DoD says "use `churches.timezone`", which reads as a code change: record a one-line amendment ("met by ADR 0023's wall-clock convention; only today/now comparisons needed conversion"). **One verified miss:** `volunteer-schedule.tsx:308-309` re-splits upcoming/past on the client in UTC, so after 8 pm at a UTC−4 church tonight's plan moves to "Past". Must fix before merge.

## 2. Is the wall-clock convention sound for MVP?

Yes, for MVP (zero buffer; one live zone). What breaks as the product grows: mixing with real instants (`events.starts_at`; any merged calendar or "overlaps event" logic); the dead local onboarding path writes real instants; DB session-TimeZone coupling; multi-campus in different zones (impossible under one `churches.timezone`); ICS export, reminder crons and the Planning Center import all need conversion at every boundary, so schedule the migration before ICS or PCO import. Email/SMS text is safe (built from `service_date` + `service_time`).

## 3. Gap 1 and M1

**Not yet closed.** G1.6 has no PR yet, and the DoD's CI-journey clause is only partly true: `service-plan-rotation.spec.ts` covers auto-fill, confirm, decline, blockout-skip and notify, but **no e2e builds a plan or adds songs** (it uses a seeded `PLAN_ID`). Left for M1: fix the client split; G1.6 PR green; a plan-build and songs journey (about 0.25–0.5 day) or a DoD amendment. Volunteer Scheduling ~88% at merge; MVP readiness **70 → 71/100** (not higher: deliveries depend on G5.1).

## 4. Top 5

1. [V] Client upcoming/past split in UTC — must fix.
2. [V] No e2e for "build a plan" or "add songs" (Gap 1's CI-journey clause).
3. [V] The DoD test clause is only partly met (no plan-list, conflict or pool test at an evening clock).
4. [I] Wall-clock shifts beside instant-based events are a latent offset bug for any merged calendar, ICS export or PCO import — move the deferral earlier.
5. [V, minor] Import placement in `lib/volunteer-data.ts` and `lib/blockout-dates.ts`; implicit DB `TimeZone = UTC` dependency.
