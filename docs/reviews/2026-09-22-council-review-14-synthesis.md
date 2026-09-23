# Council Review 14 — Synthesis

**Date:** 2026-09-22
**Branch audited:** `feat/service-planning-song-library` (commit `8c57631`)
**Scope:** Diff-scoped — Story 1 of a 5-story split closing Council Review 9's #1-ranked competitive gap ("no setlist builder, song library, or volunteer-role matching for services"), reconfirmed unchanged through Council Review 13 (five consecutive rounds at 65/100 MVP readiness).

## §0 Scope Note

This branch is well beyond the small-isolated-fix exception in `AGENTS.md`/`improve-software.md` §0 — a new tenant table, new server actions, a widened auth boundary applied across an entire existing file, new UI, and a new dependency. A full Council pass was warranted, run diff-scoped since the branch is a coherent single-story vertical slice rather than a periodic whole-app checkpoint, consistent with the precedent set by Council Review 13. This is a fresh feature branch with a single commit — no accumulated, unreviewed history to flag.

## 1. Cross-Agent Consensus

- **All four agents independently confirm the branch is safe to merge — no blockers.**
- **Agents 1, 2, 4** independently verify the auth fix is real and correctly wired: `canManageServicePlans()`/`requireServicePlanWriteAccess()` in `app/app/volunteer-actions.ts` matches the `can_manage_church()` RLS role set (`church-admin`/`pastor`/`ministry-leader`) exactly, applied to all 14 write actions in the file, and the three page-route gates under `app/app/church-admin/volunteers/*` were widened to match — closing a real prior gap where RLS already permitted pastor/ministry-leader but the page layer silently redirected them away.
- **Agent 2** confirms no other route needed widening alongside the three that were, and no broken links or orphaned handlers were introduced.
- **Agent 1** confirms the new migration is idempotent, `song_library` has correctly-scoped RLS (2 policies, `can_manage_church`/`belongs_to_church`), and the `service_plan_items.song_library_id` FK is correctly nullable with `on delete set null`.
- **Agent 3** confirms ARIA labeling and keyboard-reachability on every new interactive control (drag handle, move buttons, remove button, search input), and that failure/re-auth handling is a first-class UI state, not a generic toast.
- **Agent 4** confirms this branch closes roughly 60% of the "service planning depth" gap (song library + setlist builder), with the remainder (role taxonomy, roster view, rotation planner, rehearsal scheduling) correctly deferred to Stories 2–5 rather than missing by oversight.

## 2. Corrections Made During Synthesis (not accepted at face value)

Per the standing project lesson that an agent's own narrative or numeric claims need direct verification, not repetition — three were checked and corrected here:

1. **Agent 1's table-count claim was internally inconsistent** ("115 CREATE TABLE / 115 RLS enabled" in one place, "114/114" in another). The Documenter ran `npm run audit:rls` and counted directly: **115 distinct tables exist across all migrations; 105 are `church_id`-bearing and all 105 pass the audit with zero failures.** The ~10-table gap is expected (control-plane-only tables like `tenants`/`platform_admins` are intentionally outside this audit's scope). `song_library` is included and passes with 2 policies. Both agent-cited numbers were imprecise; neither was fabricated, but neither was independently run either.

2. **Agent 4 cited a stale test count** ("1,452/1,452 total app tests pass") — this is Council Review 13's baseline figure. Agent 4 has no shell access and did not run the suite itself. The Documenter ran it directly: **1527/1527 tests pass, 130 files**, including all new coverage from this branch (28 tests in `song-library-actions.test.ts`, 3 in `volunteer-schedule.test.tsx`, 8 role-gate regression tests added to `volunteer-actions.test.ts` during this build's own validation pass).

3. **Agent 3's `SimpleGrid cols={3}` mobile-breakpoint finding was verified against the actual diff.** The Documenter confirmed via `git diff main...HEAD` that this line is *not* part of this branch's changes — it's pre-existing code the agent correctly flagged as a real issue, but incorrectly implied (by including it in a branch-scoped audit without noting the distinction) might be in scope for this PR. Logged as backlog, not a blocker.

None of these corrections changed the overall verdict — all three were precision/staleness issues in agent self-reporting, not substantive defects in the implementation.

## 3. ADR Assessment

**No ADR needed.** Confirmed independently by all four agents: `song_library`'s RLS reuses the existing `can_manage_church`/`belongs_to_church` pattern verbatim; `requireServicePlanWriteAccess()` reuses the exact precedent already established by `app/calendar/actions.ts`'s `canManageEvents()`; the UI reuses existing Mantine/Sentry/testing-library conventions. No new architectural boundary, role-access pattern, integration contract, or data-exposure rule was introduced.

## 4. Implementation Prompts

None — this branch was already fully implemented and independently validated (two rounds: the primary implementation-validator pass, plus this Council pass) before this review ran. No further prompts to sequence for Story 1.

**Backlog items surfaced, not part of this PR** (candidates for future stories or a small standalone fix):
- Pre-existing `SimpleGrid cols={3}` mobile-squeeze issue at `volunteer-schedule.tsx:1402` (Agent 3, confirmed pre-existing).
- `lib/stripe/*` and `lib/volunteer-data.ts` remain untested (Agent 1, pre-existing, unrelated to this branch).
- Section-level loading skeleton for song search, and an on-screen keyboard-shortcut hint for drag-reorder (Agent 3, cosmetic).

## 5. Verification (Phase 3)

Run on commit `8c57631` (working tree clean, all changes committed):

- `npx vitest run` — **1527/1527 passed, 130 test files**.
- `npm run lint` — 0 errors, 7 pre-existing unrelated warnings (unchanged baseline).
- `npx tsc --noEmit` — clean.
- `npm run build` — clean, all routes compile.
- `npm run audit:rls` — PASSED; `song_library` included (RLS enabled, 2 policies); 105/105 `church_id`-bearing tables clean.

## 6. MVP Readiness

**66–67/100** (Agent 4's estimate, up from 65/100 held across Reviews 9–13) — a real, modest, verified step on Volunteer Scheduling specifically, not a phase-gate change. Phase A (single-church pilot) remains GO. Phases B–D remain NO-GO: Stories 2–5 of this split (role taxonomy, team roster, rotation planner, rehearsal scheduling) are still needed before "service planning depth" moves from partially- to substantially-addressed, and Phase D's binding blocker (an uncoached pilot church completing onboarding) is untouched by this branch.

## 7. Verdict

**Approved to merge.** No blockers from any of the four agents. Two imprecise/stale agent claims were caught and corrected during synthesis rather than carried into the record (§2) — consistent with, and a continuation of, this project's standing practice of verifying agent self-reports rather than accepting them narratively.

**Next:** proceed to Story 2 (Role Taxonomy & Team Roster) of the 5-story Service Planning split per the story-writer's original sequencing, once this PR merges.
