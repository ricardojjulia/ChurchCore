# Council Review 15 — Agent 1: Database & API State Audit

**Branch:** `feat/service-planning-role-taxonomy` (commit `4e081a9`), stacked on `feat/service-planning-song-library` (Story 1, PR #146)
**Scope:** Diff-scoped review of Role Taxonomy & Team Roster (Service Planning Story 2)

---

## 1. Migrations Audit

New migration `supabase/migrations/20260924000000_service_plan_role_taxonomy.sql`:

- **Idempotency:** all DDL guarded with `if not exists` checks, matching repo convention.
- **RLS:** `service_plan_role_types` has 2 policies (`can_manage_church()` write, `belongs_to_church()` read) — same pattern as Story 1's `song_library`.
- **Backfill:** case-insensitive collision collapse via `lower(name)` + `DISTINCT ON`, deterministic `ORDER BY` for consistent winning spelling, blank/whitespace names coalesced to `'Unnamed Role'`, `ON CONFLICT ... do nothing` for re-run safety.
- **NOT NULL enforcement:** applied only after the backfill completes, failing loudly if any position is left unmapped — correct ordering.
- **FK:** `service_plan_positions.role_type_id` is `ON DELETE RESTRICT`, added last, defensive-only (soft-delete is the only real deactivation path). `role_name` made nullable rather than dropped, preserving legacy data.

## 2. Lib & Server Utilities

`lib/volunteer-data.ts` gains `getChurchSkillOptions()` (dedups `volunteer_profiles.skills` in JS, no new RPC) and `getRoleTypes()`. `getServicePlanDetail()` extended to live-join role-type name/required-skills rather than reading stored text. No centralized skill catalog table — skill vocabulary is implicitly derived from `volunteer_profiles.skills`; noted as a scoped, non-blocking limitation (adding a real catalog table is a larger change than this story's scope).

## 3. API Routes

No new routes — role-taxonomy operations are server actions in `app/app/volunteer-actions.ts`, consistent with the rest of this module.

## 4. App Pages

New `app/app/church-admin/volunteers/role-types/page.tsx` is a real page (not a stub): loads role types and skill options, gates on the three-role check, renders `RoleTypeManager`. No empty stubs found anywhere in the diff.

## 5. Seed Data

No explicit seed INSERTs for `service_plan_role_types` — the migration's own backfill logic serves that role for existing data. Deliberate; a fresh church starts with zero role types by design.

## 6. Branch-Specific: Tenant-Isolation Fix and Skill Validation — Verified Directly

- **`addPlanPositionAction`'s plan-ownership check is real and correctly wired.** Confirmed the function now calls `fetchServicePlanForWrite(churchId, input.planId)` before any insert, on both the local-fallback and Supabase branches, and returns `"Service plan not found."` if the plan doesn't belong to the caller's church. This closes the cross-tenant write gap found during this story's own implementation-validator pass.
- **`validateRequiredSkills` is correctly wired into both `createRoleTypeAction` and `updateRoleTypeAction`, on both paths.** This report's own first-pass draft claimed the Supabase branch of `updateRoleTypeAction` skips this check — **that claim was wrong and was corrected before this file was finalized.** The call (`app/app/volunteer-actions.ts:942`) sits *above* the `if (shouldUseLocalTenantFallback())` branch, so it runs unconditionally before either code path executes — there is no asymmetry.

## 7. Correction: this report's own first draft also claimed zero test coverage for Story 2's actions

That claim was wrong and is corrected here rather than left standing: `app/app/service-plan-role-type-actions.test.ts` exists with 34 tests covering `createRoleTypeAction`, `updateRoleTypeAction`, `deactivateRoleTypeAction`, `addPlanPositionAction` (including the new tenant-isolation and skill-validation paths), and role-gate grant/denial for all five roles. A real-Postgres integration suite (`tests/database/service-plan-role-type-taxonomy.test.ts`, 18 tests) additionally covers the migration's backfill and constraint behavior directly.

## Summary

No blockers. Migration is idempotent and correctly sequenced; both flagged "critical" findings in this report's own first draft (missing skill-validation on one path, zero tests) were false and are corrected above after direct source verification — see the synthesis for how these were caught.
