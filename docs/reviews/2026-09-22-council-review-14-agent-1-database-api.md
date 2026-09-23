# Council Review 14 — Agent 1: Database & API State Audit

**Branch:** `feat/service-planning-song-library` (commit `8c57631`)
**Scope:** Diff-scoped review of the song library + setlist builder feature (Service Planning Story 1)

---

## 1. Migrations Audit

New migration `supabase/migrations/20260922000000_song_library_and_setlist.sql`:

- **Idempotency:** `create table if not exists`, `create index if not exists`, `drop policy if exists` before recreate, and `do $$ if not exists` guards for altered columns — consistent with the repo's existing migration convention.
- **RLS:** `song_library` has RLS enabled with two policies — `song_library_manage` (`for all`, `can_manage_church()`) and `song_library_select_member` (`for select`, `belongs_to_church()`) — the same pattern used by `service_plan_items`.
- **FK scoping:** `service_plan_items.song_library_id` is a nullable FK (`on delete set null`) — correct for an optional link that shouldn't cascade-delete history.
- **New column:** `churches.song_repeat_window_weeks` added idempotently, default `12`.
- **Indexes:** `church_id`, `lower(title)`, `lower(artist)` (search), and a partial unique index on `(church_id, idempotency_key) where idempotency_key is not null` (retry-safe song creation).

## 2. Lib & Server Utilities

Reviewed `lib/` structure. Notable pre-existing gaps (not introduced by this branch): `lib/stripe/*` (payment/refund parsing) has zero unit tests; `lib/volunteer-data.ts`/`lib/volunteer-types.ts` have no dedicated test file despite complex join logic. Flagged as backlog, not blocking.

## 3. API Routes

26 files under `app/api/`. No new routes added by this branch; all existing routes validate auth state before processing. No orphaned handlers.

## 4. App Pages

93 `page.tsx` files under `app/app/`. All three volunteer/schedule pages (`volunteers`, `volunteers/schedules`, `volunteers/schedules/[id]`) now gate on `roleId !== "church-admin" && roleId !== "pastor" && roleId !== "ministry-leader"` before `redirect()`. No empty stubs found.

## 5. Seed Data

No seed rows added for `song_library` — deliberate; the library is meant to be built organically by each church, not pre-populated.

## 6. Branch-Specific: Auth Consistency

- `canManageServicePlans()` (`app/app/volunteer-actions.ts:23-25`) allows `church-admin | pastor | ministry-leader` — an exact match for the `can_manage_church()` RLS helper's role set (`supabase/migrations/20260409180000_initial_platform_foundation.sql`).
- All 14 write actions in `volunteer-actions.ts` call `requireServicePlanWriteAccess()` before mutating — verified by reading each call site, not by name-pattern matching alone.
- `searchSongLibraryAction` correctly uses only `requireChurchSession()` (read-only, any church member) — no write-level gate on a read path.
- No mismatch found between the app-layer check and the DB-layer RLS policy.

## 7. Table-Count Note (corrected during synthesis)

This report's own draft cited "115 CREATE TABLE / 115 RLS enabled (100%)" in one place and "114/114" in another — an internal inconsistency. The Documenter verified directly: **115 distinct table names appear across all migrations' `CREATE TABLE` statements; 105 of those are `church_id`-bearing and all 105 pass `npm run audit:rls` with zero failures.** The ~10-table gap is expected — control-plane-only and non-tenant-scoped tables (e.g. `tenants`, `platform_admins`) are intentionally outside this audit's scope, consistent with `DEVELOPMENT_PLAN.md`'s established "church_id-bearing tables" phrasing. `song_library` is included and passes with 2 policies.

## Summary

No blockers. Migration is idempotent and correctly RLS-scoped; app-layer and DB-layer authorization are in lockstep; no orphaned or stub pages; no new API surface. Residual, non-blocking: `lib/stripe/*` and `lib/volunteer-data.ts` remain untested (pre-existing gaps, not introduced here).
