# Council Review Synthesis — Council Review 9

**Date:** 2026-09-17
**Review ID:** Council Review 9
**Status:** Findings resolved; merge unblocked
**Scope:** `feat/council-2-8-and-project-hq` — ~3 months of previously-unmerged work (Project HQ, Council Reviews 2–8, volunteer sessional confirmation, sandbox onboarding, hardened CSV import, burnout analytics, custom reports, tenant CRUD/erasure) being landed to `main` as one consolidated PR, per the newly-adopted council mandate ([[feedback-council-mandate]]).

---

## 1. Why This Round Happened

`main` had received no feature merges since 2026-06-12 (PR #130) while ~9,700 lines / 138 files accumulated on a single branch with no council pass and no new PR. The user's response was twofold: adopt a standing mandate that the council runs before every non-trivial merge to `main` (`improve-software.md` §0, `AGENTS.md`), and add a 5th council agent — **Documenter** — whose job is closing the loop prior rounds skipped (this document, and the `DEVELOPMENT_PLAN.md`/`CHANGELOG.md` updates that follow it, are that close-out). This round is the mandate's first real application: auditing the backlog itself before it merges.

## 2. Cross-Agent Consensus

- **Two independent critical findings, both correctly scoped to block merge as filed:**
  - Agent 1: `eraseTenantDataAction`/`deleteTenantAction` had no audit trail, 5/~99 table erasure coverage, and silent failure reporting.
  - Agent 2: `/app/hq` RBAC was client-side only, with no server-side gate in front of the dashboard shell.
- **Agents 3 and 4 found no blockers** — UX/accessibility gaps (missing `aria-current`, no skeleton loaders) and product-completeness gaps (service planning, mobile UX, recurring giving) are real but don't carry data-safety or auth implications, and are appropriately scoped as follow-up work rather than merge blockers.
- **All four agents independently flagged the same root cause for stale docs**: `DEVELOPMENT_PLAN.md` and `docs/mvp-readiness-audit.md` are materially behind actual delivery. This is exactly what the Documenter role exists to fix (see §5).

## 3. Resolution

Both critical findings were fixed in this session rather than deferred, given their severity (destructive tenant-data operation; access-control gap on an internal governance tool):

- **ADR 0021** documents the tenant erasure/audit hardening decision in full.
- `app/hq/layout.tsx` adds the server-side RBAC gate Agent 2 required.
- Verification: `npm run lint` (0 errors), `npm run build` (clean), `npm run test` (1405 tests passing, including 9 new tests for `app/control/actions.ts` and 4 for `app/hq/layout.tsx`).
- Commits: `8714569` (council/Documenter infrastructure + branch hygiene), `268b915` (the two critical fixes).

## 4. Deferred Findings (tracked, not blocking)

| Finding | Source | Where tracked |
|---|---|---|
| Tenant erasure table list is hand-maintained, not schema-driven; no real cross-table atomicity | Agent 1 | ADR 0021 follow-up |
| Admin re-seed insert omits `user_id`, can't authenticate | Agent 1 | ADR 0021 follow-up |
| No tiered control-plane permission model (viewer/operator/admin) | Agent 1 | ADR 0021 follow-up |
| Missing `aria-current="page"` across all shell nav components | Agent 3 | `docs/reviews/2026-09-17-council-review-9-agent-3-ux-shell.md` |
| No loading skeletons on data-heavy pages | Agent 3 | same |
| Silent failure on custom-reports CSV export | Agent 3 | same |
| Service planning, phone-first mobile UX, recurring giving, incumbent migration tooling, provider breadth | Agent 4 | `docs/reviews/2026-09-17-council-review-9-agent-4-feature-competitive.md` |
| `origin/fix/people-mobile-filters` (old remote branch name) still exists, unmerged separately | Documenter | should be deleted once this PR merges — confirm with user first |
| GitHub reports 57 Dependabot vulnerabilities on `main` (4 critical, 31 high, 21 moderate, 1 low); PR #134 open | Documenter | unrelated to this branch, flagged for separate attention |

None of these block this merge. They are reasonable inputs to the next council round's Phase 1 prompts.

## 5. Documenter Close-Out

Per `improve-software.md` §5 (Phase 4), the following were updated after verification passed:

- `DEVELOPMENT_PLAN.md` — status section corrected; no longer describes "Sprint 2 unblocked."
- `CHANGELOG.md` — `[Unreleased]` entry added for the council/Documenter infrastructure and the erasure/HQ hardening.
- Memory (`feedback_council_mandate.md`, `project_council_9_merge.md`, `arch_supabase_only.md` addendum) — recorded for future sessions.
- This synthesis and all four agent reports are committed under `docs/reviews/`.

## 6. Outcome

Merge unblocked. Proceeding to open the PR for `feat/council-2-8-and-project-hq` against `main`, referencing this synthesis.
