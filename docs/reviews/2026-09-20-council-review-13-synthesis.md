# Council Review 13 — Synthesis

**Date:** 2026-09-20
**Branch audited:** `fix/error-boundaries-finance-tests-member-route`
**Scope:** diff-scoped — a small, self-contained branch closing three items from `DEVELOPMENT_PLAN.md`'s near-term backlog (updated after Council Review 12): scoped `error.tsx` boundaries at `app/app`, `app/portal`, `app/control`; test coverage for `importFinanceRowsAction`'s batch-commit/journal-posting workflow; and confirmation of the standing `/app/member` 404 question.

## §0 Scope Note

This branch is larger than the small-isolated-fix exception in `AGENTS.md`/`improve-software.md` §0 (it adds new user-facing behavior — scoped error recovery — plus new test coverage across two files), so a full Council pass was run rather than a scoped-evaluation substitute, consistent with the corroborating example set by Council Review 12's similarly-sized branch. Unlike Review 12, this branch does not touch RLS, migrations, or any shared shell component beyond adding three new files and one new shared component — a genuinely narrower footprint. All 4 agents confirm no blockers.

## 1. Cross-Agent Consensus

- **All four agents independently confirm the branch is safe to merge — no blockers, no regressions.**
- **Agents 1, 2, 3** confirm the three new `error.tsx` files (`app/app/error.tsx`, `app/portal/error.tsx`, `app/control/error.tsx`) close the repeat Council Review 9/10/12 finding ("only `app/global-error.tsx` exists"). All delegate to a shared `PageErrorBoundary` component that reports to Sentry and exposes a `reset()`-driven "Try again" action, mirroring the existing `PageLoadingSkeleton`/`loading.tsx` convention at the same three roots.
- **Agents 1 and 3** independently flag the same deferred, non-blocking residual gap: no error.tsx exists below these three root segments, so a deep-route error (e.g. `/app/church-admin/finance/accounts/[id]`) is now caught one level higher than ideal instead of crashing to `global-error.tsx` — an improvement over the prior state, not a full fix. Carry this forward as backlog, not a blocker.
- **Agent 2** independently re-verified the `/app/member` 404 question by reading `app/app/[role]/page.tsx` directly: `params.role === "member"` renders `MemberPortalHome`. This closes the question Council Review 11 opened and Review 12 investigated — confirmed a third time, now by a dedicated route audit. **No code change needed; this is a documentation close, not a fix.**
- **Agents 1, 2, 4** confirm the new `app/app/finance-actions.test.ts` coverage (3 new tests: local-fallback commit, Supabase-path commit, debit/credit account-code resolution) directly asserts the `finance_journal_lines` rows a committed import produces — account id, side, amount, sort order — for both storage backends.
- **MVP readiness: 65/100, unchanged for a 5th consecutive round** (Reviews 9, 10, 11, 12, 13). RLS remains 114/114 tables, unchanged since Review 12 (this branch adds no migrations).

## 2. A Correction, Caught During Synthesis (not by Documenter after the fact)

Agents 1, 3, and 4 initially disagreed about whether the finance-import batch-commit coverage gap identified in Review 12 was actually closed:

- **Agent 4's** first-pass report (and, less directly, **Agent 3's**) claimed a residual gap: "no test verifying GL posting output... no test asserts that journal lines actually post to GL ledger accounts," and Agent 4 additionally asserted "GL auto-posting on journal post via background process (Supabase functions or backend cron)" as an existing, untested piece of production code.
- **Agent 1** read the source directly rather than taking that framing at face value: `postJournalAction` (`app/app/finance-actions.ts`) only updates `finance_journals.status` from `draft` to `posted` — no cron, Supabase function, or any other background process touches finance journals or journal lines anywhere in the codebase. The only GL-adjacent background/webhook path in the app is `donation_gl_posts`, which belongs to the separate Stripe-donation flow, not finance-import.
- Given `finance_journal_lines` rows **are** the general-ledger entries in this double-entry schema, and the three new tests assert their exact debit/credit/account content for both storage backends, there is no untested "GL posting output" left to cover — that code doesn't exist. Agent 4 reviewed Agent 1's finding and retracted the claim in its own report (see `2026-09-20-council-review-13-agent-4-feature-competitive.md` §3).

**Resolution:** the finance-import batch-commit/journal-posting test-coverage backlog item from `DEVELOPMENT_PLAN.md` is **closed**, not partially closed. This is the same pattern the standing memory on council-synthesis scrutiny calls out — an agent's own narrative claim (here, an entire imagined subsystem) needs to be checked against source, not accepted because it sounds plausible or because another agent independently repeated it. Two agents repeating the same unverified claim is not corroboration; reading the code is.

## 3. ADR Assessment

**No ADR needed.** Confirmed independently across all four agents: no new architectural boundary, role-access pattern, integration contract, or data-exposure rule was introduced. `PageErrorBoundary` reuses the existing Sentry (`Sentry.captureException`, already used in `app/global-error.tsx`) and Mantine `Alert` conventions; the new tests reuse the existing action-test mocking pattern already established in `app/app/finance-actions.test.ts` and `app/app/member-actions.test.ts`.

## 4. Implementation Prompts

None — all three backlog items were already implemented and verified before this Council pass ran (build-with-tests, not feature-factory, since none of the three items required new architectural decisions). No further prompts to sequence.

## 5. Verification (Phase 3)

Run before this Council pass, on the branch as committed (`6279671`, later rewritten to `0c6d003` post-review — see §7):

- `npm run lint` — 0 errors, 7 pre-existing warnings unrelated to this branch (unchanged from Council Review 11/12's baseline).
- `npm run build` — all routes compiled clean, including the three new `error.tsx` route-segment files.
- `npx vitest run` — **1452/1452 passed** (127 test files), up from 1417 at Review 11/before this branch's 2 new component tests + 3 new action tests.
- Re-run after the §7 commit rewrite (content byte-identical, only authorship changed): `npx vitest run` — 1452/1452 passed again.

## 7. Post-Synthesis Note: Commit Authorship Fix

The Documenter's close-out pass flagged that the implementation commit (`6279671`) had its author/committer email set to the placeholder `your-email@example.com` (matching this machine's global git config) rather than the GitHub-verified `32270383+ricardojjulia@users.noreply.github.com` used by every other commit on `main` — the exact `unverified_email` failure mode `AGENTS.md` documents from PR #142. Since the branch had no upstream and nothing was pushed, the implementation commit and the Documenter's own commit were both rewritten in place (cherry-picked onto the same base with corrected `GIT_AUTHOR_EMAIL`/`GIT_COMMITTER_EMAIL`, not via a global config change) — new hashes `0c6d003` (implementation) and `f6290d4`/its successor (Documenter). Content is byte-identical to the pre-fix versions (confirmed via `git diff` against a temporary backup branch before deleting it); only authorship metadata changed. This doc's references to `6279671` are left as-written for historical accuracy about what was verified when, but the commit that actually merges will carry the corrected hash.

All green. No red result — proceeding to Documenter.

## 6. Residual, Non-Blocking Backlog (for `DEVELOPMENT_PLAN.md`'s "Next" line)

- Nested route-segment `error.tsx` below `app/app`, `app/portal`, `app/control` (e.g. per-feature-area boundaries) — real, deferred, low-severity per Agents 1 and 3.
- Nested-route `loading.tsx` gap in deeper subroutes (e.g. `/app/member/family/*`) — unchanged from Review 12, still plausible-but-unverified in depth, not touched by this branch.
- Everything else on the Phase B ranked backlog (service planning, mobile UX, recurring giving, migration tooling, provider breadth) — unchanged, not in scope for this branch.
