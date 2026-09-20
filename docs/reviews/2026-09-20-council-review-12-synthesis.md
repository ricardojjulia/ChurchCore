# Council Review Synthesis — Council Review 12

**Date:** 2026-09-20
**Review ID:** Council Review 12
**Status:** No blocking findings — branch clear to proceed to Documenter close-out and PR
**Branch under review:** `fix/webhook-dlq-finance-tests-aria-skeleton`

---

## 0. Scope Note

Unlike the language-translation branch (PR #141), which used a "scoped evaluation" that the repo's own automated PR review correctly judged insufficient for a branch of that size, this branch (a schema change — `communication_dlq` + RLS — plus new backend retry logic, an accessibility fix across shared shell components, and new/expanded test coverage) clearly falls inside `improve-software.md` §0's trigger conditions for the full Council mandate. The user was asked whether to run a diff-scoped audit or the full generic whole-app audit again (Council Review 11 — the landing-page redesign — had already run two days after Review 10); they chose the full whole-app audit again, so that is what ran here, as Council Review 12.

## 1. Cross-Agent Consensus

- **RLS remains fully clean**: Agent 1 independently confirms all 114 tables (up from 107 at Review 10, reflecting tables added since, including `communication_dlq`) have RLS enabled. No agent found a gap.
- **MVP readiness holds steady at 65/100** for the fourth consecutive round (Reviews 9, 10, 11 landing-page-scoped, and now 12), with the same five competitive gaps in the same order. This is now a stable, well-corroborated number, not a one-off.
- **This branch's own changes are independently confirmed working, not just claimed**: Agent 3 verified the `aria-current` fix in both `app-shell.tsx` and `member-bottom-nav.tsx` directly in the source and confirmed test coverage exists. Agent 4 confirmed the `communication_dlq` write path is real and functioning. Neither took the commit messages at face value — both read the actual current files.

## 2. Corrections Applied (three stale/wrong claims found this round, all disproven directly before accepting)

1. **"Missing `app/app/member/page.tsx` — live 404 risk"** (Agent 1's original top finding, echoed more cautiously by Agent 3). **False.** `app/app/[role]/page.tsx` is a Next.js dynamic route segment that renders `MemberPortalHome` for `role === "member"` — no literal directory is required for dynamic routing. Verified directly: the file exists, imports `MemberPortalHome`, and Agent 2 (route/page audit) correctly identified this the whole time, creating a direct agent-vs-agent contradiction within the same round that had to be resolved by reading the file myself rather than picking a side. Removed from Agent 1's gap list.
2. **"No unit tests for `parseCsv`/`parseXlsx`/`parsePlainText`/`detectFormat`"** (Agent 4). **False as of this branch.** These four functions have 27 passing tests in `lib/finance-import.test.ts`, added earlier in this same session (commit `36aa670`) — before Agent 4 ever ran. Agent 4 restated Council Review 10's finding without checking current file content.
3. **"`audit_log` lacks `church_id`/`actor_role` columns"** (Agent 4, presented as a new independent finding). **False**, and doubly so: Agent 1's own report in this same round directly contradicts it by reading migration `20260607030000_security_h5_audit_log_church_id_actor_role.sql`, which — as its filename states — added exactly those columns. Agent 4 produced two wrong factual claims in one report this round; its unverified assertions get extra scrutiny going forward, per the standing practice in `feedback_council_synthesis_scrutiny.md`.

**Pattern note:** this is the fourth documented instance this session of an agent report needing a factual correction (Review 10 had two, Review 11's landing-page review had one WCAG-contrast miscalculation, now Review 12 has three). None of the corrections this round required a live recomputation like Review 11's contrast ratio — all three were resolved by directly reading the relevant source file, which took under a minute each. The lesson from `feedback_council_synthesis_scrutiny.md` continues to hold and continues to pay for itself.

## 3. Real, New Findings From This Round (deferred, not blocking)

| Finding | Source | Notes |
|---|---|---|
| No intermediate `error.tsx` at `app/app/`, `app/portal/`, `app/control/` | Agent 3 | Confirmed real — only `app/global-error.tsx` (root) exists. A thrown error in any nested route currently crashes the whole app view rather than recovering within that section. |
| Possible gap: no nested `loading.tsx` in deeper member routes | Agent 3 | Plausible but **not independently re-verified live** (would require a running dev server and browser-level check of Next.js's actual per-navigation Suspense behavior between sibling routes with no shared layout.tsx). Logged as a refinement to consider, not confirmed as a regression of this branch's loading-skeleton fix. |
| Finance-import **batch-commit** workflow (GL posting) has no test coverage, distinct from the now-tested parsers | Agent 1 | Real, correctly scoped — the parsers were this branch's target; the commit/posting action was never in scope. |
| No audit-trail verification test for data erasure completion | Agent 1 | Carried forward from Review 9, still open. |
| `communication_dlq` has no alerting/dashboard | Agent 1, Agent 4 | Expected and already noted as an explicit non-goal in this branch's own DLQ commit message — a backend safety net was the stated scope, not an operator-facing UI. |

## 4. ADRs

None needed. This branch's changes (an RLS-scoped table following the existing `can_manage_communications()` pattern, a generic loading-skeleton component using Next.js's standard `loading.tsx` convention, and test additions) don't introduce a new architectural boundary, access-control pattern, or data-exposure rule — they apply existing patterns to close specific, named gaps.

## 5. Outcome

No implementation changes required from this round's findings — all are either disproven, already out of this branch's stated scope, or genuinely deferred/non-blocking future work. Proceeding to Documenter close-out and then a PR for `fix/webhook-dlq-finance-tests-aria-skeleton` against `main`, referencing this synthesis.
