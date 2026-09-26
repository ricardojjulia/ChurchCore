# Council Review 19 — Agent 1: Database & API Audit

**Branch:** `feat/service-planning-rotation-planner`, diff-scoped to commit `eca7bb1` (Service Planning Story 3, rotation planner). Checked against the diff and against live `pg_policies`, `pg_proc` and `pg_indexes` on local Supabase (4202), with the migration and seed applied, plus an EXPLAIN of the pool function's body. SELECT only; `.env.local` was not opened. **[V]** = verified, **[I]** = inferred.

**Bottom line:** tenant isolation and authorization hold up. The real risks are performance (no indexes on `volunteer_shifts`) and a check-then-insert race in auto-fill. Nothing here blocks the merge on security grounds.

## 1. Migration
- **Idempotency is fine [V].** It uses `add column if not exists`, a CHECK behind a `pg_constraint` guard, and `create or replace` for the functions. The CHECK (`null` or 1–31) matches the action's validation. Nit: the guard looks up `conname` without the table.
- **SECURITY INVOKER with `search_path=public` is right [V]:** `prosecdef=f`, `proconfig={search_path=public}`.
- **RLS gives all three roles complete data [V].** The tables the functions read (`profiles`, `volunteer_profiles`, `volunteer_shifts`, `volunteer_blocked_dates`, `volunteer_hours_log`, `service_plan_positions`) each have a `*_manage` policy on `can_manage_church(church_id)`. That policy covers church_admin, pastor, ministry_leader and platform admin, so pastor and ministry-leader get complete counts, not partial ones.
- **Another church's `p_church_id` returns nothing [V].** Every `profiles` policy (`can_manage_church`, `belongs_to_church`, `can_access_daily_desk`) evaluates false for it.
- **A plain member calling the RPC gets nothing new [V/I].** They see directory-visible profiles plus shift and skill aggregates they can already select directly. Blocked-date and hours rows are limited to their own.
- **Grant hygiene [V].** `proacl` shows EXECUTE for PUBLIC and `anon`. Anon gets nothing, because every policy is `TO authenticated`. The explicit grants are redundant without a `revoke ... from public, anon`.

## 2. Server actions
- **Authorization and scoping are sound [V].**
  - All four actions call `requireServicePlanWriteAccess()`.
  - The plan lookup is church-scoped, and positions are checked against the plan.
  - `updateVolunteerFrequencyAction` checks that the profile belongs to the church before upserting. The upsert keeps `skills`.
  - No new local-SQL branch: the Supabase-only mandate is met.
- **Auto-fill re-validation is mostly sound [V].**
  - It re-reads the pool for each item.
  - A duplicate profile is caught on its second pass by `serving_on_date`.
  - A full position is refused by `openByPosition`.
  - Gap: it does not re-apply the "at least one matched skill" rule that `proposePlanFill` enforces.
- **Races [V].** The conflict and capacity checks followed by the insert are not atomic, and no constraint backs them up. Concurrent applies, or two admins working at once, can double-book a volunteer or over-fill a position.
- **Conflict-check semantics match the pool function [V].** Both bucket by day in the DB session timezone (UTC).
  - **[I]** An evening service in UTC−4 whose shift carries a real offset would land on the next UTC day. Planner-created shifts store local wall time as UTC, so they are consistent with each other but not with the true local day.
  - The burnout window differs slightly from the pool window; the pool's is the stricter one.
- **Pre-existing [V]:** `assignVolunteerAction` never checks that `positionId` belongs to `planId`, that `profileId` belongs to the church, or that the position has capacity. Insert RLS only checks `church_id`.

## 3. Performance
- **Missing indexes [V].** `volunteer_shifts` has no index on `church_id` or `assigned_user_id`. Its only indexes are the pkey, `plan_id`, `event_id` and `confirmation_token`.
- **Pool function [V, EXPLAIN].** The `shifts` CTE is materialised by a sequential scan of every tenant's shifts, then 4 correlated CTE-scan subplans run per profile.
  - **[I]** At 2,000 profiles and 20k shifts that is about 160M row checks per call.
  - Apply makes one call per assignment.
- **Directory function [V].** It runs 3 correlated subqueries per profile against `volunteer_shifts`. The `extract(year …)` filter is non-sargable.

## 4. Seed
- **Order and re-runs [V].** FK order is safe, deletes are church-scoped, IDs are fixed, and the scenario's arithmetic checks out.
- **Cosmetic:** Samuel's −7-day shift is attached to the −14-day past plan, and the block sits after the "Seed complete" notice.
- **Side effect:** reseeding wipes any hand-made service plans in the demo church.

## 5. Tests
- **DB tests connect as superuser [V].** RLS is bypassed, and the "RLS applies" test only checks the `prosecdef` flag. Nothing runs as `authenticated` to prove cross-tenant denial or pastor/ministry-leader visibility.
- **Mocked assign conflict test [V].** It checks the query shape only.
- **e2e [V].** Church-admin happy path only.
- **CI [V].** `test:db` runs correctly after `db reset` on 4202.

## 6. Top 5
1. **Missing index, and functions that cost O(profiles × shifts).** Add a `volunteer_shifts(church_id, assigned_user_id, starts_at)` index and rewrite both functions as grouped aggregates.
2. **Auto-fill/assign race.** Fix with a partial unique index, an advisory lock or a transactional RPC.
3. **RLS never exercised in the DB tests.** Run the functions under `set local role authenticated` with JWT claims.
4. **[I] UTC day bucketing** for evening services in UTC−4.
5. **Pre-existing:** `assignVolunteerAction` accepts an unverified `positionId`/`profileId`.

Lesser item: revoke PUBLIC and anon EXECUTE on both functions.
