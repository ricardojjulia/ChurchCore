# Factory Run: Scoped Error Boundaries, Finance Batch-Commit Tests, `/app/member` Close-Out, and Council Review 13

Date: 2026-09-20
Type: Error-handling UX + test coverage + documentation close + diff-scoped Council audit + Documenter close-out
Branch: `fix/error-boundaries-finance-tests-member-route`
Scope: `app/{app,portal,control}/error.tsx`, `components/application/page-error-boundary.tsx` (+test), `app/app/finance-actions.test.ts`, `docs/reviews/2026-09-20-council-review-13-*.md` (5 files), `DEVELOPMENT_PLAN.md`, `CHANGELOG.md`, memory

---

## Intent

Close the three smaller backlog items Council Review 12 left open in `DEVELOPMENT_PLAN.md`'s "Next" line: (1) no scoped `error.tsx` route-segment boundaries at `app/app`, `app/portal`, `app/control` — only the root `app/global-error.tsx` existed; (2) `importFinanceRowsAction`'s batch-commit/journal-posting workflow had no test coverage, distinct from the finance-import parsers already covered at Review 12; (3) the standing "`/app/member` 404 risk" question opened at Review 11 and investigated (but not formally closed) at Review 12. A diff-scoped Council Review 13 then audited the branch to confirm the fixes and re-check overall MVP health. This run is the Documenter close-out.

## Factory workflow

Claude Code, `documenter` subagent (`.claude/agents/documenter.md`), invoked after the implementation commit (`6279671`) and Council Review 13's audit/synthesis (5 files) were already committed/staged.

## Story and acceptance criteria

- A runtime error inside `app/app`, `app/portal`, or `app/control` must be caught by a scoped boundary offering recovery (Sentry report + retry), not fall straight through to the unstyled root `app/global-error.tsx`.
- `importFinanceRowsAction`'s batch-commit path must have test coverage asserting the exact `finance_journal_lines` rows a committed import produces, for both storage backends.
- The `/app/member` route-existence question must be conclusively confirmed or fixed, not left open a third round.
- Council Review 13's audit and synthesis outputs must be committed, findings triaged, and no ADR left unwritten if one was implied.
- `DEVELOPMENT_PLAN.md`, `CHANGELOG.md`, and memory must reflect the branch's actual, verified state.

## Technical brief

- **Architecture impact:** none — confirmed independently by all four Council Review 13 agents (synthesis §3). `PageErrorBoundary` reuses the existing Sentry (`Sentry.captureException`) and Mantine `Alert` conventions already used in `app/global-error.tsx`; the new tests reuse the existing action-test mocking pattern already established in `app/app/finance-actions.test.ts` and `app/app/member-actions.test.ts`.
- **Tenant boundary / RBAC:** unchanged — no new tables, no new RLS surface, no migrations on this branch. RLS remains 114/114 `church_id`-bearing tables per Council Review 12's last live check; not re-run this round since nothing changed.
- **Sensitive data:** none newly touched. `PageErrorBoundary` reports the thrown `Error` object to Sentry via the same path `app/global-error.tsx` already uses — no new data class introduced.
- **Documentation impact:** `DEVELOPMENT_PLAN.md`'s Current Status and "Next" line updated this run; `CHANGELOG.md` `[Unreleased]` entry added this run.

## Implementation summary

- `6279671` — added `app/app/error.tsx`, `app/portal/error.tsx`, `app/control/error.tsx`, each a thin wrapper delegating to the new shared `components/application/page-error-boundary.tsx` (`PageErrorBoundary`). `PageErrorBoundary` reports to Sentry on mount (`useEffect` + `Sentry.captureException`) and renders a Mantine `Alert` with a "Try again" button wired to Next's `reset()`. New tests in `components/application/page-error-boundary.test.tsx` (2 tests: Sentry called on mount, `reset()` called on click).
- Same commit — 3 new tests in `app/app/finance-actions.test.ts` (`describe("importFinanceRowsAction batch commit")`): local-fallback-mode commit, Supabase-path commit, and debit/credit account-code resolution, each asserting the exact `finance_journal_lines` rows produced (account id, side, `amount_cents`, `sort_order`).
- Same commit — the `/app/member` question closed by reading `app/app/[role]/page.tsx` directly: it is a dynamic catch-all that renders `MemberPortalHome` when `params.role === "member"`. No code change.
- `docs/reviews/2026-09-20-council-review-13-{agent-1-database-api,agent-2-route-page,agent-3-ux-shell,agent-4-feature-competitive,synthesis}.md` — diff-scoped Council Review 13, confirming the above and re-checking overall MVP health.
- This run: `DEVELOPMENT_PLAN.md` Current Status and Next line updated; `CHANGELOG.md` `[Unreleased]` entry added; memory updated (see below); no ADR written (confirmed independently by all four agents, matching the synthesis's own conclusion).

## Verification

Commands and results as reported by the implementation session and reconfirmed via the committed synthesis (this Documenter pass did not independently re-run the full suite; see Residual Risk):

- `npm run lint` — 0 errors, 7 pre-existing warnings unrelated to this branch (unchanged baseline from Council Review 11/12).
- `npm run build` — all routes compiled clean, including the three new `error.tsx` route-segment files.
- `npx vitest run` — **1452/1452 passed**, 127 test files (up from 1447 at Council Review 12, reflecting this branch's 5 new tests: 2 in `page-error-boundary.test.tsx`, 3 in `finance-actions.test.ts`).
- `docs/reviews/2026-09-20-council-review-13-*.md` (5 files) — confirmed staged via `git status` at the start of this Documenter pass (see below).

## Residual risk

- **Deferred, non-blocking findings from Council Review 13** (synthesis §6):
  - No nested `error.tsx` below `app/app`, `app/portal`, `app/control` — a deep-route error (e.g. `/app/church-admin/finance/accounts/[id]`) is now caught one level higher than ideal instead of the exact failing segment. An improvement over the prior state, not a full fix.
  - Nested-route `loading.tsx` gap in deeper member subroutes (e.g. `/app/member/family/*`) — unchanged from Review 12, still plausible-but-unverified in depth, not touched by this branch.
  - Everything on the Phase B ranked backlog (service planning, mobile UX, recurring giving, migration tooling, provider breadth) — unchanged, out of scope for this branch.
- **MVP readiness unchanged:** 65/100, reconfirmed for a **fifth consecutive round** (Reviews 9–13). Phase A remains GO; Phase B–D remain NO-GO, Phase D's binding blocker still an uncoached pilot church, not more engineering.
- **A correction caught during synthesis, not after the fact** (synthesis §2): two agents initially restated Review 12's finance batch-commit gap as still open, and one additionally invented a nonexistent "GL auto-posting background process." A third agent read the source directly (`postJournalAction` only flips a status column; no such background process exists) and the claim was retracted in its own report before synthesis finalized. Resolution: the gap is fully closed. This corroborates the standing `feedback_council_synthesis_scrutiny` memory lesson, with a new variant — self-correction happened *during* synthesis, by another agent, not caught by the Documenter afterward.
- **Commit authorship/signature risk — flagged by the Documenter, fixed immediately after.** The implementation commit `6279671` had `git config user.email` set to the placeholder `your-email@example.com` (both locally and, per `git config --global user.email`, globally on this machine) — the same failure mode documented in `AGENTS.md`'s "verified commit signatures" note and in the `CHANGELOG.md` entry for PR #142's merge block. The branch had no upstream (nothing pushed), so both the implementation commit and the Documenter's own commit were rewritten in place — cherry-picked onto the same base with `GIT_AUTHOR_EMAIL`/`GIT_COMMITTER_EMAIL` set to the GitHub-issued noreply address (`32270383+ricardojjulia@users.noreply.github.com`, matching every other commit on `main`), not via a global config change, per `AGENTS.md`. New hashes: `0c6d003` (implementation) and `f6290d4`'s rewritten successor (Documenter). Content confirmed byte-identical via `git diff` against a temporary backup branch (deleted after verification); only authorship metadata changed. `npx vitest run` re-run after the rewrite: 1452/1452 passing, unchanged. This section (and the "Delivery"/draft-PR sections below) still refer to the original `6279671` hash as historical record of what was verified when — see the Council Review 13 synthesis §7 for the same note.
- **Separate, pre-existing drift — not caused by this branch, flagging per instructions rather than silently fixing:** PR #144 (`fix(marketing): recolor landing page to match the in-app palette`, commit `c35163f`) is already merged to `main` but has no `CHANGELOG.md` entry and no `DEVELOPMENT_PLAN.md` mention. It changed only color tokens in `app/page.tsx` (dark navy/gold → the app shell's actual `churchBlue`/light palette) with no layout/copy/structural change, per its own PR description. This should get a short changelog/plan entry in a future pass (by whoever handles it, or on request) — left untouched here since it's unrelated to this branch's scope.

## Follow-up work

- Add nested `error.tsx` boundaries below `app/app`, `app/portal`, `app/control` before a future round flags the same gap again.
- Independently re-verify (with a running dev server) whether deeper member subroutes have a real nested-`loading.tsx` gap.
- Backfill a `CHANGELOG.md`/`DEVELOPMENT_PLAN.md` entry for the already-merged PR #144 landing-page recolor (separate, pre-existing drift, not part of this branch).
- Prioritize the Phase B blockers (service planning, mobile UX, recurring giving, migration tooling, provider breadth) per `competitive_roadmap_priorities.md` memory — unchanged and now reconfirmed by five consecutive rounds.
- Open the PR for `fix/error-boundaries-finance-tests-member-route` against `main`, referencing `docs/reviews/2026-09-20-council-review-13-synthesis.md` and this factory-run entry, and confirming Documenter sign-off per `AGENTS.md`.

## Delivery

- Branch: `fix/error-boundaries-finance-tests-member-route`.
- Commits (post authorship-fix rewrite): `0c6d003` (error boundaries + finance batch-commit tests + `/app/member` close), `f6290d4`'s rewritten successor (Documenter close-out, Council Review 13's five `docs/reviews/` files + this doc + memory + plan/changelog updates).
- Pull request: not yet opened as of this run — see draft PR description below for the next step.

---

## Draft PR description (paste when opening the PR)

**Title:** `fix: scoped error boundaries, finance batch-commit tests, /app/member close-out (Council Review 13)`

**Body:**

### Summary

- Adds scoped `error.tsx` route-segment boundaries at `app/app`, `app/portal`, `app/control`, each delegating to a new shared `PageErrorBoundary` component (`components/application/page-error-boundary.tsx`) that reports to Sentry and offers a "Try again" retry via Next's `reset()` — closing the repeat Council Review 9/10/12 finding that only the root `app/global-error.tsx` existed.
- Adds 3 new tests covering `importFinanceRowsAction`'s batch-commit/journal-posting workflow (local-fallback commit, Supabase-path commit, account-code resolution), each asserting the exact `finance_journal_lines` rows produced — distinct from the finance-import parsers already covered at Review 12.
- Closes the standing "`/app/member` 404 risk" question (open since Review 11): `app/app/[role]/page.tsx` is a dynamic route that already serves it. No code change needed.
- Runs Council Review 13, a diff-scoped audit (4 agents), confirming this branch's fixes work in source and reconfirming MVP readiness at 65/100 for a fifth consecutive round. See `docs/reviews/2026-09-20-council-review-13-synthesis.md`.

### Verification

- `npm run lint` — 0 errors, 7 pre-existing warnings unrelated to this branch.
- `npm run build` — clean, all routes compiled.
- `npx vitest run` — 1452/1452 passing (127 test files).
- Documenter close-out complete: `DEVELOPMENT_PLAN.md`, `CHANGELOG.md`, and memory updated — see `docs/factory-runs/2026-09-20-error-boundaries-finance-tests-member-route-council-review-13.md`.

### Residual risk / follow-up

- Deferred, non-blocking: no nested `error.tsx` below the three new roots; nested-route `loading.tsx` gap in deeper member subroutes still unverified (unchanged since Review 12).
- MVP readiness unchanged at 65/100 (Reviews 9–13 agree). Phase A is GO; Phase B–D remain NO-GO pending an uncoached pilot church, per `docs/plans/mvp-competitive-go-no-go-checklist.md`.
- **Before merge:** verify this branch's commits report `"verified": true` via `gh api repos/<owner>/<repo>/commits/<sha> --jq '.commit.verification'` once pushed — the placeholder-email issue on the implementation commit was already caught and fixed pre-push (rewritten to `0c6d003`), so this should be a formality, not a blocker.

### Council reference

Council Review 13 synthesis: `docs/reviews/2026-09-20-council-review-13-synthesis.md`. Documenter sign-off: confirmed, this PR.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
