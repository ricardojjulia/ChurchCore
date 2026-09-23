# Council Review 15 — Synthesis

**Date:** 2026-09-22
**Branch audited:** `feat/service-planning-role-taxonomy` (commit `4e081a9`)
**Base branch:** `feat/service-planning-song-library` (Story 1, PR #146 — **not yet merged to `main`**)
**Scope:** Diff-scoped — Story 2 of the 5-story Service Planning split (Role Taxonomy & Team Roster), continuing the work Council Review 14 approved for Story 1.

## §0 Scope Note

This branch is stacked: it targets `feat/service-planning-song-library` as its base, not `main` directly, since it depends on Story 1's schema and hasn't merged yet. This is a deliberate structural choice — Story 2 was built directly on Story 1's branch, then split into its own commit/branch/PR so that PR #146's existing Council Review 14 approval stays valid for exactly what it reviewed (Story 1 alone), rather than being silently invalidated by additional commits. This PR's own merge sequencing is: merge #146 to `main` first, then retarget/merge this PR.

This branch is well beyond the small-isolated-fix exception (new tenant table, new server actions, a real tenant-isolation bug found and fixed, new UI, new route) — a full Council pass was warranted, run diff-scoped since it's a coherent single-story vertical slice, consistent with the precedent set by Reviews 13 and 14.

## 1. Cross-Agent Consensus

- **All four agents independently confirm the branch is safe to merge — no blockers.**
- **Agents 1 and 4** confirm the real cross-tenant write bug found during this story's own implementation-validator pass (`addPlanPositionAction` never verified the target plan belonged to the caller's church before inserting) is correctly closed: it now calls `fetchServicePlanForWrite(churchId, input.planId)` before any insert, on both the local-fallback and Supabase branches, returning `"Service plan not found."` for a cross-church plan.
- **Agent 1** confirms the new migration is idempotent, `service_plan_role_types` has correctly-scoped RLS (2 policies), the backfill's case-collision-collapse and blank-name-coalescing logic is correctly sequenced before the `NOT NULL` constraint is applied, and the FK is a defensive `ON DELETE RESTRICT`.
- **Agent 2** confirms the new `/app/church-admin/volunteers/role-types` route's role gate exactly matches the sibling `volunteers`/`volunteers/schedules` routes, and nav cross-linking is complete and reciprocal across all four routes in this family.
- **Agent 3** confirms empty states (zero role types, zero positions), the desktop/mobile roster split, and error handling all follow established patterns correctly; found one minor, non-blocking ARIA gap (see §4).
- **Agent 4**, after correction (see §2), confirms Stories 1+2 combined close an estimated ~75% of Council Review 9's #1-ranked competitive gap, with the literal "volunteer-role matching" language now substantively addressed by real, shipped skill-ranking logic — not just typed roles.

## 2. Corrections Made During Synthesis

Per the standing project practice of verifying agent claims directly against source rather than accepting them narratively — three claims were checked and corrected here, all caught by the Documenter cross-referencing the agents' reports against actual source before finalizing this synthesis:

1. **Agent 1's first-pass draft claimed the Supabase branch of `updateRoleTypeAction` skips the new `validateRequiredSkills` server-side check, calling it a "HIGH PRIORITY" gap.** This is wrong. `validateRequiredSkills(session, requiredSkills)` (`app/app/volunteer-actions.ts:942`) is called *before* the `if (shouldUseLocalTenantFallback())` branch — it's unconditional and applies to both paths identically. There is no asymmetry.

2. **Agent 1's first-pass draft also claimed "zero unit tests cover any of the 5 new Story 2 actions," calling it a "sign-off blocker."** This is wrong. `app/app/service-plan-role-type-actions.test.ts` exists on this branch with 34 tests covering exactly these actions (create/update/deactivate/addPlanPositionAction, including the tenant-isolation and skill-validation paths), plus an 18-test real-Postgres integration suite (`tests/database/service-plan-role-type-taxonomy.test.ts`) covering the migration's backfill and constraint behavior directly. Both facts were verified with a direct file check (`ls`, `grep -c`) before being included here.

3. **Agent 4's first-pass draft claimed skill-based volunteer ranking is "❌ explicitly deferred to Story 3,"** conflating it with the genuinely-deferred rotation *planner* (Story 3, which wires `burnout_calculator.ts` for fatigue-aware auto-suggestion — a distinct capability). This is wrong. `countMatchedSkills()`, the sort-by-match-count comparator, and the rendered match-count badge are all present and tested in *this* branch (`components/application/volunteer-schedule.tsx`). Skill-ranking is shipped, not deferred.

None of these corrections changed the overall verdict — all three were agent misreadings of source that didn't reflect actual defects, and all three happened to skew toward *understating* this branch's completeness rather than overstating it, which is a different failure shape than several prior rounds' corrections (which mostly caught overstated/invented gaps). Logged as a fresh instance of the standing `feedback_council_synthesis_scrutiny` memory lesson — this round's specific variant is two agents independently misreading straightforward, findable code (an unconditional function call's position relative to a branch; a working feature's presence) rather than fabricating a claim or citing stale data.

## 3. ADR Assessment

**No ADR needed.** Confirmed independently across all four agents: RLS reuses the existing `can_manage_church`/`belongs_to_church` pattern verbatim; the tenant-isolation fix reuses the existing `fetchServicePlanForWrite` helper already established by Story 1; the UI reuses existing Mantine/testing-library conventions and the established desktop/mobile split pattern. No new architectural boundary, role-access pattern, integration contract, or data-exposure rule was introduced.

## 4. Implementation Prompts

None — already fully implemented and independently validated (implementation-validator pass plus this Council pass) before this review ran.

**Backlog items surfaced, not part of this PR:**
- Missing contextual `aria-label`s on `RoleTypeManager`'s Edit/Deactivate buttons (Agent 3) — logged rather than fixed inline, since 8 existing test assertions depend on the exact current accessible names and fixing both together is a small but separate change.
- No centralized skill catalog/governance table (Agent 1) — skill vocabulary is currently implicit from `volunteer_profiles.skills`; a real catalog with admin-controlled canonical names is a larger, separate initiative.
- Pre-existing `SimpleGrid cols={3}` mobile-breakpoint issue (carried forward from Council Review 14, reconfirmed present, still outside this branch's diff).

## 5. Verification (Phase 3)

Run on commit `4e081a9` (working tree clean, all changes committed):

- `npx vitest run` — **1598/1598 passed, 134 test files**.
- `npx vitest run --config vitest.db.config.ts` — **18/18 passed, 3 files** (real-Postgres integration tests covering the migration directly).
- `npm run lint` — 0 errors, 7 pre-existing unrelated warnings (unchanged baseline).
- `npx tsc --noEmit` — clean.
- `npm run build` — clean, all routes compile including the new `/app/church-admin/volunteers/role-types`.
- `npm run audit:rls` — PASSED; `service_plan_role_types` included (RLS enabled, 2 policies).

## 6. MVP Readiness

**67–69/100** (Agent 4's estimate, up from 66–67/100 after Story 1) — continued incremental, verified progress on Volunteer Scheduling specifically. Phase A remains GO. Phases B–D remain NO-GO: Stories 3–5 of this split are still needed, the other four ranked competitive gaps (mobile UX, recurring giving, migration tooling, provider breadth) are untouched, and Phase D's binding blocker (an uncoached pilot church completing onboarding) is unaffected by this branch.

## 7. Verdict

**Approved to merge** (into `feat/service-planning-song-library` first, then to `main` once PR #146 merges — see §0). No blockers from any of the four agents. Three agent misreadings were caught and corrected during synthesis rather than carried into the permanent record — continuing this project's standing practice of verifying claims against source before accepting them.

**Next:** once both PR #146 (Story 1) and this PR (Story 2) merge to `main`, proceed to Story 3 (Rotation Planner) of the 5-story Service Planning split.
