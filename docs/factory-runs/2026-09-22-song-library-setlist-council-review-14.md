# Factory Run: Song Library & Setlist Builder (Service Planning Story 1) and Council Review 14

Date: 2026-09-22
Type: New feature (tenant table + server actions + UI) + diff-scoped Council audit + Documenter close-out
Branch: `feat/service-planning-song-library`
Scope: `supabase/migrations/20260922000000_song_library_and_setlist.sql`, `app/app/volunteer-actions.ts` (+test), `components/application/volunteer-schedule.tsx` (+test), three `app/app/church-admin/volunteers/*` page routes (+tests), `package.json`/`package-lock.json` (new `@dnd-kit/*` dependency), `docs/reviews/2026-09-22-council-review-14-*.md` (5 files), `DEVELOPMENT_PLAN.md`, `CHANGELOG.md`, `README.md`, memory

---

## Intent

Close Council Review 9's #1-ranked competitive gap ("no setlist builder, song library, or volunteer-role matching for services"), reconfirmed unchanged through five consecutive Council rounds (Reviews 9–13, all at 65/100 MVP readiness). Delivered as Story 1 of a 5-story split rather than one large branch: song library + setlist builder now, role taxonomy/team roster, rotation planner, rehearsal scheduling, and an `event_id`-required schema precondition still to come as Stories 2–5. A diff-scoped Council Review 14 then audited the branch before merge. This run is the Documenter close-out.

## Factory workflow

Claude Code, `documenter` subagent (`.claude/agents/documenter.md`), invoked after the implementation commit (`8c57631`) and Council Review 14's audit/synthesis (5 files) already existed on disk as untracked files.

## Story and acceptance criteria

- Church-admin, pastor, and ministry-leader users can search a church-wide song catalog or create a new song, add it to a service plan's setlist, reorder the setlist (drag-and-drop and move-up/down), remove items, and see a non-blocking warning when a song was used inside the church's configurable repeat window.
- The app-layer write gate on service-plan actions and pages must match the `can_manage_church()` RLS policy already governing these tables (church-admin/pastor/ministry-leader), not be narrower than it.
- `last_used_date` must propagate to a linked song only when its plan is marked complete, using the plan's own `service_date`, consistently on both the local-fallback and Supabase code paths.
- Council Review 14's audit and synthesis outputs must be committed, findings triaged, and no ADR left unwritten if one was implied.
- `DEVELOPMENT_PLAN.md`, `CHANGELOG.md`, `README.md`, and memory must reflect the branch's actual, verified state.

## Technical brief

- **Architecture impact:** none — confirmed independently by all four Council Review 14 agents (synthesis §3). `song_library`'s RLS reuses the existing `can_manage_church()`/`belongs_to_church()` pattern verbatim (same as `service_plan_items`); `requireServicePlanWriteAccess()` reuses the exact precedent already established by `app/calendar/actions.ts`'s `canManageEvents()`; the UI reuses existing Mantine/Sentry/testing-library conventions. New dependency: `@dnd-kit/core`/`@dnd-kit/sortable`/`@dnd-kit/utilities` for drag-and-drop reorder — a mainstream, well-supported library, not flagged as needing an ADR by any agent.
- **Tenant boundary / RBAC:** new `song_library` table is `church_id`-scoped with RLS (2 policies), included in and passing `npm run audit:rls`. The auth-gate widening (church-admin-only → church-admin/pastor/ministry-leader) closes a real gap where the page layer was narrower than the DB layer, not a boundary weakening — RLS already permitted the wider set.
- **Sensitive data:** none newly introduced. Song titles/artists/keys are not PII/PHI-classified data.
- **Documentation impact:** `DEVELOPMENT_PLAN.md` Current Status and "Next" line updated this run; `CHANGELOG.md` `[Unreleased]` entry added; `README.md`'s "Current Application Surface" list updated; no ADR needed (confirmed independently by all four Council Review 14 agents).

## Implementation summary

- `8c57631` — new migration `supabase/migrations/20260922000000_song_library_and_setlist.sql`: `song_library` table (RLS via `can_manage_church()`/`belongs_to_church()`, idempotency-key retry-safe), nullable `service_plan_items.song_library_id` FK (`on delete set null`), new `churches.song_repeat_window_weeks` setting (default 12).
- Same commit — search / add-existing-song-to-plan / create-and-link-new-song / remove-item server actions in `app/app/volunteer-actions.ts`; `last_used_date` propagation on plan completion using `service_date`; auth-gate widening applied to all 14 write actions in the file plus the three `app/app/church-admin/volunteers/*` page routes.
- Same commit — setlist-builder UI in `components/application/volunteer-schedule.tsx`: song search-and-add, inline creation, drag-and-drop reorder, remove-item button, repeat-usage warning, re-auth prompt on session expiry.
- `docs/reviews/2026-09-22-council-review-14-{agent-1-database-api,agent-2-route-page,agent-3-ux-shell,agent-4-feature-competitive,synthesis}.md` — diff-scoped Council Review 14, confirming no blockers and correcting two agent self-report errors (see Residual Risk).
- This run: `DEVELOPMENT_PLAN.md` Current Status and "Next" line updated; `CHANGELOG.md` `[Unreleased]` entry added; `README.md`'s "Current Application Surface" list updated; memory updated (see below); no ADR written (confirmed independently by all four agents).

## Verification

Commands and results as reported by the implementation session and reconfirmed via the committed synthesis (this Documenter pass re-derived the corrected table/test counts directly rather than trusting either agent's draft numbers; see synthesis §2 and §5):

- `npx vitest run` — **1527/1527 passed**, 130 test files (up from 1452 at Council Review 13; includes 28 new tests in `song-library-actions.test.ts`, 3 in `volunteer-schedule.test.tsx`, 8 role-gate regression tests in `volunteer-actions.test.ts`).
- `npm run lint` — 0 errors, 7 pre-existing unrelated warnings (unchanged baseline).
- `npx tsc --noEmit` — clean.
- `npm run build` — clean, all routes compile.
- `npm run audit:rls` — PASSED; 105/105 `church_id`-bearing tables clean, `song_library` included (RLS enabled, 2 policies).
- `docs/reviews/2026-09-22-council-review-14-*.md` (5 files) — present on disk as untracked files at the start of this Documenter pass; content reviewed and found internally consistent with the corrections already folded into the agent reports themselves (Agent 1 and Agent 4's files already carry the corrected numbers, per synthesis §2).

## Residual risk

- **Deferred, non-blocking findings from Council Review 14** (synthesis §4):
  - Pre-existing `SimpleGrid cols={3}` mobile-breakpoint issue at `components/application/volunteer-schedule.tsx:1402` — confirmed via `git diff main...HEAD` to be outside this branch's own diff. Needs its own small follow-up.
  - `lib/stripe/*` and `lib/volunteer-data.ts` remain untested — pre-existing gaps, unrelated to this branch.
  - Section-level loading skeleton for song search, and an on-screen keyboard-shortcut hint for drag-reorder — cosmetic, non-blocking.
- **MVP readiness moved for the first time since Review 9:** 66–67/100 (up from 65/100 held across Reviews 9–13) — a real, modest step on Volunteer Scheduling specifically, not a phase-gate change. Phase A remains GO; Phases B–D remain NO-GO — Stories 2–5 are still needed, and Phase D's binding blocker (an uncoached pilot church completing onboarding) is untouched by this branch.
- **Two corrections caught during Documenter synthesis, not mid-round this time** (synthesis §2, corroborating `feedback_council_synthesis_scrutiny` memory with a new instance): Agent 1's own draft cited internally inconsistent table counts ("115" vs. "114" in different places), resolved directly at 115 distinct tables / 105 `church_id`-bearing / 105 passing `audit:rls`; Agent 4 (no shell access) cited Council Review 13's stale test count instead of the branch's actual state. Both agent report files on disk already carry the corrected numbers.
- **New, unrelated finding surfaced during this Documenter pass, not part of this branch's diff — flagging per instructions rather than fixing:** a separate, pre-existing `worship_songs`/`worship_rehearsals` table pair (per-ministry-scoped, not church-wide) already powers a same-named "Song Library" section in `components/application/ministry-track-worship.tsx` (Ministry Forge's worship track panel, shipped earlier under Ministry Forge Phase 4). The new `song_library` table this branch adds is a distinct, unconnected data model with the same display name. None of the four Council Review 14 agents flagged this overlap. Not a bug — both tables are internally consistent and correctly scoped for their own purpose — but a naming-collision risk for whoever builds Story 2+ or later tries to reconcile "the" song library into one concept. Logged in `project_service_planning_song_library.md` memory; not fixed here (would require a product decision on whether/how to merge the two).
- **Separate, larger pre-existing drift found while checking README/docs for "meaningful change" scope — not caused by this branch, flagging per instructions rather than silently fixing:** `README.md`'s "Product Position & Competitive Analysis" banner states *"ChurchCore is Phase D-READY — all technical and competitive gates are closed. The only remaining milestone before full Phase D GO is an uncoached external evaluator session,"* backed by `docs/mvp-competitive-analysis.md` (dated 2026-06-12, "Competitive 60 days (broad mid-market): PHASE D-READY... all buildable gates closed 2026-07-10") and `docs/plans/mvp-competitive-go-no-go-checklist.md` (dated 2026-05-29, listing "Service-planning depth closes replacement blocker" as a **required** Phase C gate) and `docs/plans/competitive-readiness-roadmap.md` (dated 2026-05-25/updated 2026-05-31, "Worship/service planning... Not competitive"). All four of these predate Council Review 9 (2026-09-17), which established the still-current 65/100 MVP score and explicit Phase B–D NO-GO verdicts (memory: `competitive_roadmap_priorities.md`), and none of the five subsequent Council rounds (10–14) touched them — this appears to be an established, if unstated, convention that `DEVELOPMENT_PLAN.md`'s "Current Status" section plus `docs/reviews/` are the live source of truth and these four older docs are legacy/superseded, not actively maintained. They were not touched in this pass either, consistent with that pattern, but the contradiction is large (README literally tells a reader "all gates closed" while the plan says NO-GO for three of four phases) and worth a deliberate decision — archive/supersede them explicitly, or reconcile their content — rather than leaving five council rounds' worth of accumulated silence to stand as the de facto answer.
- **Commit authorship — flagged, not fixed in this pass.** The implementation commit `8c57631` has `git config user.email` set to the placeholder `your-email@example.com` (confirmed both locally and globally on this machine) — the same `unverified_email` failure mode documented in `AGENTS.md` and hit twice before (PR #142, and the Review 13 implementation commit). This branch has no upstream yet (nothing pushed). Per the task instructions for this run, no commits were made or rewritten in this pass — changes were left staged for review before anything is committed. **Before pushing or opening a PR, this commit's author/committer must be rewritten to a verified GitHub-issued address** (`GIT_AUTHOR_EMAIL`/`GIT_COMMITTER_EMAIL`, not global config), the same way it was fixed on the Review 13 branch.

## Follow-up work

- Proceed to Story 2 (Role Taxonomy & Team Roster) of the 5-story Service Planning split.
- Fix the pre-existing `SimpleGrid cols={3}` mobile-breakpoint issue at `volunteer-schedule.tsx:1402` as a small standalone follow-up.
- Add test coverage for `lib/stripe/*` and `lib/volunteer-data.ts` (pre-existing gaps, unrelated to this branch, carried forward again).
- Decide how to handle the naming collision between the new church-wide `song_library` table and the pre-existing per-ministry `worship_songs` table before Story 2+ work touches either.
- Decide how to handle the four stale, pre-Council-era competitive-readiness docs (README banner, `docs/mvp-competitive-analysis.md`, `docs/plans/mvp-competitive-go-no-go-checklist.md`, `docs/plans/competitive-readiness-roadmap.md`) — either a deliberate archive/supersede note or a reconciliation pass against the current 65–67/100 status.
- Rewrite commit `8c57631`'s author/committer email to a verified address before pushing or opening a PR.
- Open the PR for `feat/service-planning-song-library` against `main`, referencing `docs/reviews/2026-09-22-council-review-14-synthesis.md` and this factory-run entry, and confirming Documenter sign-off per `AGENTS.md`.

## Delivery

- Branch: `feat/service-planning-song-library`.
- Commits: `8c57631` (implementation). This Documenter pass's changes (docs/memory) were left uncommitted for review, per this run's task instructions — no new commit hash yet.
- Pull request: not yet opened — see draft PR description below for the next step, once the commit-authorship issue above is resolved and the branch is pushed.

---

## Draft PR description (paste when opening the PR, after fixing commit authorship)

**Title:** `feat: song library & setlist builder for service planning (Story 1, Council Review 14)`

**Body:**

### Summary

- Adds a new church-wide `song_library` table and setlist-builder UI for `service_plans` — Story 1 of a 5-story split closing Council Review 9's #1-ranked competitive gap ("no setlist builder, song library, or volunteer-role matching for services"), unchanged through five consecutive Council rounds (Reviews 9–13).
- Search/create/add/reorder/remove songs on a setlist, with a non-blocking repeat-usage warning against a configurable per-church repeat window (default 12 weeks) and `last_used_date` tracking that only advances when a plan is marked complete.
- Fixes a real pre-existing auth bug found along the way: service-plan write actions and three page routes were church-admin-only, narrower than the `can_manage_church()` RLS policy already covering these tables (which allows pastor/ministry-leader too) — those roles could write via RLS but were silently redirected away at the page layer.
- Runs Council Review 14, a diff-scoped audit (4 agents), confirming no blockers and raising MVP readiness to 66–67/100 (first movement since 65/100 was set at Review 9). See `docs/reviews/2026-09-22-council-review-14-synthesis.md`.

### Verification

- `npx vitest run` — 1527/1527 passing (130 test files).
- `npm run lint` — 0 errors, 7 pre-existing warnings unrelated to this branch.
- `npx tsc --noEmit` — clean.
- `npm run build` — clean, all routes compiled.
- `npm run audit:rls` — 105/105 `church_id`-bearing tables clean, `song_library` included with 2 policies.
- Documenter close-out complete: `DEVELOPMENT_PLAN.md`, `CHANGELOG.md`, `README.md`, and memory updated — see `docs/factory-runs/2026-09-22-song-library-setlist-council-review-14.md`.

### Residual risk / follow-up

- Deferred, non-blocking: pre-existing `SimpleGrid cols={3}` mobile-breakpoint issue at `volunteer-schedule.tsx:1402`; `lib/stripe/*`/`lib/volunteer-data.ts` remain untested; a cosmetic loading-skeleton/keyboard-hint gap.
- Story 1 partially closes gap #1 (~55–65% per Agent 4); Stories 2–5 (role taxonomy/roster, rotation planner, rehearsal scheduling, `event_id`-required schema change) are still needed before service planning moves off the top of the ranked backlog.
- A naming collision was found (not fixed): a pre-existing, unrelated `worship_songs` table already powers a same-named "Song Library" panel in Ministry Forge's worship track — distinct from this branch's church-wide `song_library` table.
- Separately, several older competitive-readiness docs (README banner, `docs/mvp-competitive-analysis.md`, the go/no-go checklist, the competitive-readiness roadmap) predate Council Review 9 and contradict the current 65–67/100 status — flagged for a deliberate reconciliation pass, not touched here.
- **Before merge:** verify this branch's commits report `"verified": true` via `gh api repos/<owner>/<repo>/commits/<sha> --jq '.commit.verification'` once pushed — commit `8c57631` currently carries a placeholder `your-email@example.com` author/committer email and needs rewriting to a verified GitHub-issued address first.

### Council reference

Council Review 14 synthesis: `docs/reviews/2026-09-22-council-review-14-synthesis.md`. Documenter sign-off: confirmed, this PR.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
