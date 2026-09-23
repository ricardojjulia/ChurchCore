# Factory Run: Role Taxonomy & Team Roster (Service Planning Story 2) and Council Review 15

Date: 2026-09-22
Type: New feature (tenant table + server actions + UI) + diff-scoped Council audit + Documenter close-out
Branch: `feat/service-planning-role-taxonomy` (commit `4e081a9`), stacked on `feat/service-planning-song-library` (Story 1, PR #146, **not yet merged to `main`**)
Scope: `supabase/migrations/20260924000000_service_plan_role_taxonomy.sql`, `app/app/volunteer-actions.ts` (+test), `lib/volunteer-data.ts` (+test), `lib/volunteer-types.ts`, `components/application/role-type-manager.tsx` (+test), `components/application/volunteer-schedule.tsx` (+test), three `app/app/church-admin/volunteers/*` page routes (+tests), a new `app/app/church-admin/volunteers/role-types/` route (+test), `tests/database/service-plan-role-type-taxonomy.test.ts`, `docs/reviews/2026-09-22-council-review-15-*.md` (5 files), `DEVELOPMENT_PLAN.md`, `CHANGELOG.md`, `README.md`, memory

---

## Intent

Continue closing Council Review 9's #1-ranked competitive gap ("no setlist builder, song library, or volunteer-role matching for services") as Story 2 of the 5-story Service Planning split, following Story 1 (song library & setlist builder, Council Review 14, 2026-09-22, PR #146, still unmerged). This branch is stacked on Story 1's branch rather than `main`, since it depends on Story 1's schema and Story 1 hasn't merged yet — a deliberate structural choice so PR #146's existing Council Review 14 approval stays valid for exactly what it reviewed. A diff-scoped Council Review 15 then audited this branch before merge. This run is the Documenter close-out.

## Factory workflow

Claude Code, `documenter` subagent (`.claude/agents/documenter.md`), invoked after the implementation commit (`4e081a9`) and Council Review 15's audit/synthesis (5 files) already existed on disk as untracked files.

## Story and acceptance criteria

- Church-admin, pastor, and ministry-leader users can define church-specific role types (with optional required skills), edit or deactivate them, and see them applied consistently across service plans.
- Existing free-form `service_plan_positions.role_name` text must be safely backfilled into typed role-type rows without data loss or spurious duplicates.
- A role type's required skills must be validated server-side against real `volunteer_profiles.skills` values, not just enforced by the UI.
- The volunteer-assignment pool must rank matching volunteers first when a role type has required skills, without hiding non-matching volunteers.
- A consolidated roster view must show every position slot on a service plan, flag unassigned slots, and show confirmation status.
- `/app/church-admin/volunteers/role-types` must be gated identically to sibling volunteer routes and cross-linked in nav.
- Council Review 15's audit and synthesis outputs must be committed, findings triaged, and no ADR left unwritten if one was implied.
- `DEVELOPMENT_PLAN.md`, `CHANGELOG.md`, `README.md`, and memory must reflect the branch's actual, verified state.

## Technical brief

- **Architecture impact:** none — confirmed independently by all four Council Review 15 agents (synthesis §3). `service_plan_role_types`'s RLS reuses the existing `can_manage_church()`/`belongs_to_church()` pattern verbatim; the tenant-isolation fix reuses the existing `fetchServicePlanForWrite` helper already established by Story 1; the UI reuses existing Mantine/testing-library conventions and the established desktop/mobile roster-split pattern. No new dependency.
- **Tenant boundary / RBAC:** new `service_plan_role_types` table is `church_id`-scoped with RLS (2 policies), included in and passing `npm run audit:rls`. A real cross-tenant write bug was found and fixed during this story's own implementation-validator pass (before Council Review 15 ran): `addPlanPositionAction` previously relied only on RLS to catch a cross-church plan write after the fact; it now calls `fetchServicePlanForWrite(churchId, input.planId)` before any insert, on both code paths.
- **Sensitive data:** none newly introduced. Role-type names and required skills are not PII/PHI-classified data.
- **Documentation impact:** `DEVELOPMENT_PLAN.md` Current Status and "Next" line updated this run; `CHANGELOG.md` `[Unreleased]` entry added; `README.md`'s "Current Application Surface" bullet extended (same bullet as Story 1, since this is a continuation of the same feature area); no ADR needed (confirmed independently by all four Council Review 15 agents).

## Implementation summary

- `4e081a9` — new migration `supabase/migrations/20260924000000_service_plan_role_taxonomy.sql`: `service_plan_role_types` table (RLS via `can_manage_church()`/`belongs_to_church()`), idempotent, with a backfill converting existing free-form `service_plan_positions.role_name` text into typed rows (case-insensitive collision collapse, blank/whitespace coalescing to a placeholder, sequenced before the `NOT NULL` constraint), FK `ON DELETE RESTRICT`.
- Same commit — `createRoleTypeAction`/`updateRoleTypeAction`/`deactivateRoleTypeAction` server actions in `app/app/volunteer-actions.ts` (dual-path, matching Story 1's in-file convention); server-side `requiredSkills` validation against `volunteer_profiles.skills`; the `addPlanPositionAction` tenant-isolation fix; skill-based ranking (`countMatchedSkills()`, sort comparator, match-count badge) in the volunteer-assignment pool; a consolidated roster view on the service-plan detail page.
- Same commit — new `RoleTypeManager` component and `/app/church-admin/volunteers/role-types` route, gated church-admin/pastor/ministry-leader, with reciprocal nav cross-linking to/from sibling volunteer routes.
- `docs/reviews/2026-09-22-council-review-15-{agent-1-database-api,agent-2-route-page,agent-3-ux-shell,agent-4-feature-competitive,synthesis}.md` — diff-scoped Council Review 15, confirming no blockers and correcting three agent misreadings (see Residual Risk).
- This run: `DEVELOPMENT_PLAN.md` Current Status and "Next" line updated; `CHANGELOG.md` `[Unreleased]` entry added; `README.md`'s "Current Application Surface" bullet extended; memory updated (see below); no ADR written (confirmed independently by all four agents).

## Verification

Commands and results as reported in the committed synthesis (`docs/reviews/2026-09-22-council-review-15-synthesis.md` §5), run on commit `4e081a9` with a clean working tree:

- `npx vitest run` — **1598/1598 passed**, 134 test files (up from 1527 at Council Review 14; includes 34 tests in `app/app/service-plan-role-type-actions.test.ts` plus `role-type-manager.test.tsx`, `lib/volunteer-data.test.ts`, and expanded `volunteer-schedule.test.tsx` coverage).
- `npx vitest run --config vitest.db.config.ts` — **18/18 passed**, 3 files, including `tests/database/service-plan-role-type-taxonomy.test.ts` (real-Postgres integration coverage of the migration's backfill and constraint behavior).
- `npm run lint` — 0 errors, 7 pre-existing unrelated warnings (unchanged baseline).
- `npx tsc --noEmit` — clean.
- `npm run build` — clean, all routes compile including the new `/app/church-admin/volunteers/role-types`.
- `npm run audit:rls` — PASSED; `service_plan_role_types` included (RLS enabled, 2 policies).
- `docs/reviews/2026-09-22-council-review-15-*.md` (5 files) — present on disk as untracked files at the start of this Documenter pass; content reviewed and found internally consistent with the corrections already folded into the agent reports themselves (synthesis §2).
- Commit authorship — `4e081a9`'s author/committer email is already the verified GitHub-issued `32270383+ricardojjulia@users.noreply.github.com`, unlike Story 1's initial commit (which needed a rewrite). No authorship fix needed before pushing this branch.

## Residual risk

- **Deferred, non-blocking findings from Council Review 15** (synthesis §4):
  - Missing contextual `aria-label`s on `RoleTypeManager`'s Edit/Deactivate buttons — not fixed, since 8 existing test assertions depend on the current exact accessible names; a small but separate follow-up.
  - No centralized skill catalog/governance table — skill vocabulary is currently implicit from `volunteer_profiles.skills`; a real catalog with admin-controlled canonical names is a larger, separate initiative.
  - Pre-existing `SimpleGrid cols={3}` mobile-breakpoint issue (carried forward from Council Review 14, reconfirmed present, still outside this branch's diff).
- **MVP readiness moved again:** 67–69/100 (up from 66–67/100 after Story 1) — continued incremental, verified progress on Volunteer Scheduling specifically, not a phase-gate change. Phase A remains GO; Phases B–D remain NO-GO — Stories 3–5 are still needed, and Phase D's binding blocker (an uncoached pilot church completing onboarding) is untouched by this branch.
- **Three corrections caught during Documenter synthesis, all understating (not overstating) this branch's completeness — a new variant** (synthesis §2, corroborating `feedback_council_synthesis_scrutiny` memory with a fresh instance, logged as point 8 in that memory): Agent 1's first-pass draft wrongly claimed the Supabase branch of `updateRoleTypeAction` skips the new skill-validation check (the check is unconditional, above the branch split) and separately wrongly claimed zero tests exist for Story 2's actions (34 tests exist, plus 18 DB-integration tests); Agent 4's first-pass draft wrongly claimed skill-based ranking is deferred to Story 3 (it's shipped and tested here — Story 3 actually defers the separate rotation/auto-assignment *planner* logic). All three were caught and corrected by the Documenter before this synthesis was finalized, and all three skewed toward understating rather than overstating completeness, unlike most prior council rounds' corrections.
- **This PR's merge sequencing is not standalone.** This branch targets `feat/service-planning-song-library` (Story 1), not `main`. Merge order: PR #146 (Story 1) merges to `main` first; this branch's PR (once opened) retargets or is opened against `main` after that, or merges into #146's branch first depending on how the PRs are sequenced at merge time. Story 3 (Rotation Planner) cannot start until both are on `main`, since it needs their combined schema.
- **Separate, unrelated drift already flagged by Story 1's close-out, not re-investigated here:** the README "Phase D-READY" banner and three older competitive-readiness docs (`docs/mvp-competitive-analysis.md`, `docs/plans/mvp-competitive-go-no-go-checklist.md`, `docs/plans/competitive-readiness-roadmap.md`) still predate Council Review 9 and contradict the current 67–69/100 status. This was flagged, not fixed, at Story 1's close-out (`docs/factory-runs/2026-09-22-song-library-setlist-council-review-14.md`) and remains an open, deliberate-decision item — noted again here per instructions rather than silently fixed, since it's unrelated to this branch's diff.

## Follow-up work

- Merge PR #146 (Story 1) to `main`, then open/retarget this branch's PR, referencing `docs/reviews/2026-09-22-council-review-15-synthesis.md` and this factory-run entry, confirming Documenter sign-off per `AGENTS.md`.
- Once both Story 1 and Story 2 are on `main`, proceed to Story 3 (Rotation Planner) of the 5-story Service Planning split.
- Fix the missing `aria-label`s on `RoleTypeManager`'s Edit/Deactivate buttons (small, needs coordinated test-assertion updates).
- Fix the pre-existing `SimpleGrid cols={3}` mobile-breakpoint issue at `volunteer-schedule.tsx:1402` (carried forward from Council Review 14).
- Consider a centralized skill catalog/governance table before Story 3's rotation planner leans further on skill data.
- Decide how to handle the four stale, pre-Council-era competitive-readiness docs (carried forward from Story 1's close-out, still not resolved).

## Delivery

- Branch: `feat/service-planning-role-taxonomy`, stacked on `feat/service-planning-song-library`.
- Commits: `4e081a9` (implementation, verified-email authorship already correct). This Documenter pass's changes (docs/memory) were left uncommitted for review, per this run's task instructions — no new commit hash yet.
- Pull request: not yet opened. Draft description below for once Story 1 (PR #146) merges and this branch is pushed/retargeted.

---

## Draft PR description (paste when opening the PR, after PR #146 merges)

**Title:** `feat: role taxonomy & team roster for service planning (Story 2, Council Review 15)`

**Body:**

### Summary

- Adds a new church-scoped `service_plan_role_types` table and role-type management UI — Story 2 of a 5-story split closing Council Review 9's #1-ranked competitive gap ("no setlist builder, song library, or volunteer-role matching for services"). Continues Story 1 (song library & setlist builder, PR #146).
- Define, edit, and deactivate church-specific role types with optional required skills; server-side validation confirms required skills are real `volunteer_profiles.skills` values.
- Skill-based ranking in the volunteer-assignment pool: role types with required skills sort matching volunteers first with a match-count badge, without hiding non-matching volunteers.
- A new consolidated roster view on the service-plan detail page: one row per position slot, unassigned slots flagged, confirmation status shown.
- Fixes a real cross-tenant write bug found during this story's own implementation-validator pass: `addPlanPositionAction` now verifies the target service plan belongs to the caller's own church before inserting a position.
- Runs Council Review 15, a diff-scoped audit (4 agents), confirming no blockers and raising MVP readiness to 67–69/100 (Stories 1+2 combined judged an estimated ~75% close of the ranked gap). See `docs/reviews/2026-09-22-council-review-15-synthesis.md`.

### Verification

- `npx vitest run` — 1598/1598 passing (134 test files).
- `npx vitest run --config vitest.db.config.ts` — 18/18 passing (real-Postgres integration tests).
- `npm run lint` — 0 errors, 7 pre-existing warnings unrelated to this branch.
- `npx tsc --noEmit` — clean.
- `npm run build` — clean, all routes compiled.
- `npm run audit:rls` — passed, `service_plan_role_types` included with 2 policies.
- Documenter close-out complete: `DEVELOPMENT_PLAN.md`, `CHANGELOG.md`, `README.md`, and memory updated — see `docs/factory-runs/2026-09-22-service-planning-role-taxonomy-council-review-15.md`.

### Residual risk / follow-up

- Deferred, non-blocking: missing `aria-label`s on `RoleTypeManager`'s Edit/Deactivate buttons; no centralized skill catalog/governance table; the pre-existing `SimpleGrid cols={3}` mobile-breakpoint issue carried forward from Council Review 14.
- Stories 1+2 combined only ~75% close gap #1; Stories 3–5 (rotation planner, rehearsal scheduling, `event_id`-required schema change) are still needed.
- This branch targets `feat/service-planning-song-library`, not `main` — merge sequencing depends on PR #146 landing first.
- Several older competitive-readiness docs (README banner, `docs/mvp-competitive-analysis.md`, the go/no-go checklist, the competitive-readiness roadmap) still predate Council Review 9 and contradict the current status — flagged again, not touched here.

### Council reference

Council Review 15 synthesis: `docs/reviews/2026-09-22-council-review-15-synthesis.md`. Documenter sign-off: confirmed, this PR.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
