# Factory Run: Webhook DLQ, Finance-Import Parser Tests, ARIA/Loading-Skeleton Fix, and Council Review 12

Date: 2026-09-20
Type: Accessibility fix + test coverage + backend feature + full whole-app Council audit + Documenter close-out
Branch: `fix/webhook-dlq-finance-tests-aria-skeleton`
Scope: `components/application/{app-shell,member-bottom-nav,page-loading-skeleton}.tsx` (+tests), `app/{app,portal,control}/loading.tsx`, `lib/finance-import.test.ts`, `supabase/migrations/20260920000000_communication_dlq.sql`, `lib/communications/retry-eligible.ts` (+tests), `docs/reviews/2026-09-20-council-review-12-*.md` (5 files), `DEVELOPMENT_PLAN.md`, `CHANGELOG.md`, memory

---

## Intent

Close three smaller backlog items that had been carried in `DEVELOPMENT_PLAN.md`'s Current Status section since Council Review 10 (2026-09-18): a repeat ARIA/loading-skeleton accessibility gap (first flagged Review 9, still open through Review 10), zero unit-test coverage on the finance-import wizard's actually-used parsing functions, and no dead-letter handling for communication retries that exhaust their retry budget. A full whole-app Council Review 12 then re-audited the entire app (not just this branch's diff) to confirm the fixes and re-check overall MVP health, at the user's preference for consistency with Review 10's whole-app cadence. This run is the Documenter close-out for all five commits.

## Factory workflow

Claude Code, `documenter` subagent (`.claude/agents/documenter.md`), invoked after all five commits and Council Review 12's audit/synthesis were already committed.

## Story and acceptance criteria

- Active nav-link state must be conveyed to assistive technology (`aria-current="page"`), not only via color/font-weight.
- Server-side data fetches under `/app`, `/portal`, and `/control` must show visible loading feedback instead of a blank screen.
- The finance-import wizard's actually-used parsing functions (`parseCsv`, `parseXlsx`, `parsePlainText`, `detectFormat`) must have real unit test coverage.
- Communication retries that exhaust their retry budget must leave a durable, queryable record of when and why, instead of silently staying at `status='failed'` forever.
- Council Review 12's audit and synthesis outputs must be committed, its findings triaged (blocking vs. deferred), and no ADR left unwritten if one was implied.
- `DEVELOPMENT_PLAN.md`, `CHANGELOG.md`, and memory must reflect the branch's actual, verified state — not aspirational status.

## Technical brief

- **Architecture impact:** none, per Council Review 12's own synthesis (§4, "ADRs: None needed"), independently confirmed by this Documenter pass. The `communication_dlq` table reuses the existing `can_manage_communications()` RLS helper pattern; the loading-skeleton wiring uses Next.js's standard `loading.tsx` file convention. Neither introduces a new architectural boundary, access-control pattern, or data-exposure rule.
- **Tenant boundary / RBAC:** `communication_dlq` is `church_id`-scoped and RLS-enabled from creation (select-only for `authenticated`, scoped via `can_manage_communications(church_id)`); no client-facing role can write to it, only the retry cron's service-role admin client. Verified live via `npm run audit:rls` (see Verification below).
- **Sensitive data:** `communication_dlq` stores `last_error_code`/`last_error_message` and a nullable `recipient_id` FK — no message body/content, consistent with the low-sensitivity classification of `communication_logs` itself.
- **Documentation impact:** `DEVELOPMENT_PLAN.md`'s Current Status section and Next line updated this run; `CHANGELOG.md` `[Unreleased]` entry added this run (none existed previously for this branch — verified before writing).

## Implementation summary

- `1ca828f` — `aria-current="page"` added to `MemberBottomNav` and all three `NavLink` usages in `ApplicationShell` (module nav, workspace link, calendar link). New tests in `app-shell.test.tsx` and `member-bottom-nav.test.tsx`.
- `08362aa` — new `PageLoadingSkeleton` component (`components/application/page-loading-skeleton.tsx`), wired via `loading.tsx` at the three major route-segment roots (`app/app`, `app/portal`, `app/control`), which Next.js automatically wraps every nested page in as a Suspense fallback.
- `36aa670` — `lib/finance-import.test.ts` grew from 13 to 27 tests, adding coverage for `parseCsv` (happy path, quoted commas, escaped quotes, empty file, real mixed-CRLF/LF papaparse behavior), `parseXlsx` (sheet selection, blank-header fallback, empty-row filtering, read-failure handling), `parsePlainText` (tab/pipe delimiters, blank-line skipping, CSV fallback), and `detectFormat` (extension-based and content-sniffing detection).
- `6e101be` — new `communication_dlq` table (`supabase/migrations/20260920000000_communication_dlq.sql`); `lib/communications/retry-eligible.ts`'s `markFailedAgain()` writes a DLQ row once `retry_count` reaches 3. The write is deliberately non-throwing (logs and continues) to avoid double-invoking the caller's own `markFailedAgain` from inside its existing try/catch loop — see `project_communication_dlq.md` memory for the full reasoning and a regression-test pointer. No operator-facing UI — a backend safety net was judged sufficient scope.
- `73bbc3e` — Council Review 12: full whole-app audit (`docs/reviews/2026-09-20-council-review-12-{synthesis,agent-1-database-api,agent-2-route-page,agent-3-ux-shell,agent-4-feature-competitive}.md`), confirming this branch's fixes work and re-checking overall MVP health. See Residual Risk below for its findings.
- This run: `DEVELOPMENT_PLAN.md` Current Status and Next line corrected; `CHANGELOG.md` `[Unreleased]` entry added; memory updated (see below); no ADR written (confirmed independently, matching the synthesis's own conclusion).

## Verification

Commands run and results, this session (re-run fresh by this Documenter pass, not assumed from the implementation session):

- `npm run typecheck` (`tsc --noEmit -p tsconfig.json`) — clean, no output.
- `npx vitest run` — **1447/1447 tests passing**, 126 test files, ~7.8s. (Up from the 1417 baseline noted in the prior `2026-09-20-landing-page-sacred-clarity-council-review-11.md` close-out — the 30-test delta accounts for this branch's new coverage: 14 finance-import tests, plus new tests in `app-shell.test.tsx`, `member-bottom-nav.test.tsx`, `page-loading-skeleton.test.tsx`, and `retry-eligible.test.ts`.)
- `npx supabase start` + `npx supabase db reset` — applied all migrations cleanly, including the new `20260920000000_communication_dlq.sql`, against a fresh local Supabase instance.
- `npm run audit:rls` — **PASSED**, all 114 `church_id`-bearing tables clean (up from 107 at Council Review 10, reflecting tables added since, including `communication_dlq`, which the audit confirms has RLS enabled with 1 policy).
- `npm run lint` — 0 errors, 7 pre-existing warnings in files untouched by this branch (unused-var in a test file, four `window.location.href` navigation warnings, one anonymous-default-export warning in `localization-governance.config.mjs`) — same baseline as the prior landing-page close-out, confirming this branch introduced no new lint issues.
- `npm run build` — compiled successfully, all routes built with no errors.
- `docs/reviews/2026-09-20-council-review-12-*.md` (5 files) — confirmed committed in `73bbc3e` via `git show --stat`, not just trusted from the commit message.

## Residual risk

- **Deferred, non-blocking findings from Council Review 12** (none require changes to this branch):
  - No intermediate `error.tsx` boundaries at `app/app`, `app/portal`, `app/control` — only the root `app/global-error.tsx` exists. A thrown error in any nested route currently crashes the whole app view rather than recovering within that section.
  - A plausible-but-unverified nested-`loading.tsx` gap in deeper member subroutes — Agent 3 flagged this as a possible refinement but could not independently re-verify it live (would need a running dev server and browser-level check of Next.js's per-navigation Suspense behavior). Logged as a refinement to consider, not confirmed as a regression of this branch's own loading-skeleton fix.
  - Finance-import's batch-commit/GL-posting workflow (distinct from the now-tested parsers) still has no test coverage — correctly scoped as out of this branch's target (the parsers were the target; the commit/posting action was never in scope).
  - No audit-trail verification test for data erasure completion — carried forward from Review 9, still open.
  - `communication_dlq` has no alerting/dashboard — expected and already noted as an explicit non-goal in the DLQ commit message itself, not a new gap.
- **Three factual corrections were needed during Council Review 12's synthesis** (all resolved by reading source, not trusting the claim — see `docs/reviews/2026-09-20-council-review-12-synthesis.md` §2 for full detail): a false "`app/app/member/page.tsx` missing, live 404" claim; a false "finance-import parsers still untested" claim (already fixed by this branch's own `36aa670` before the audit ran); and a false "`audit_log` lacks `church_id`/`actor_role`" claim (contradicted by another agent's own report in the same round). None of these required changes to this branch — they were corrections to agent reports, not real gaps.
- **MVP readiness unchanged:** 65/100, reconfirmed by Council Review 12 for the **fourth consecutive round** (Reviews 9, 10, 11, 12). Phase A (controlled single-church pilot) remains GO; Phase B–D remain NO-GO, with Phase D's binding blocker being external validation (an uncoached pilot church completing onboarding), not further engineering.

## Follow-up work

- Add intermediate `error.tsx` boundaries at `app/app`, `app/portal`, `app/control` before a third round flags the same gap again.
- Add test coverage for finance-import's batch-commit/GL-posting workflow, distinct from the now-tested parsers.
- Independently re-verify (with a running dev server, not just static analysis) whether deeper member subroutes have a real nested-`loading.tsx` gap, per Agent 3's unconfirmed flag.
- Confirm/close Council Review 11's `/app/member` 404 question explicitly in a future pass — Council Review 12 established the dynamic `[role]` route already serves this path, so this is a documentation/backlog-closure item, not an engineering fix.
- Prioritize the Phase B blockers (service planning, mobile UX, recurring giving, migration tooling, provider breadth) per `competitive_roadmap_priorities.md` memory — unchanged and now reconfirmed by four consecutive rounds.
- Open the PR for `fix/webhook-dlq-finance-tests-aria-skeleton` against `main`, referencing `docs/reviews/2026-09-20-council-review-12-synthesis.md` and this factory-run entry, and confirming Documenter sign-off per `AGENTS.md`.

## Delivery

- Branch: `fix/webhook-dlq-finance-tests-aria-skeleton`.
- Commits: `1ca828f` (aria-current fix), `08362aa` (loading skeletons), `36aa670` (finance-import parser tests), `6e101be` (communication DLQ), `73bbc3e` (Council Review 12 audit + synthesis), plus this Documenter close-out commit.
- Pull request: not yet opened as of this run — see draft PR description below for the next step.

---

## Draft PR description (paste when opening the PR)

**Title:** `fix: webhook DLQ, finance-import parser tests, ARIA/loading-skeleton gap (Council Review 12)`

**Body:**

### Summary

- Sets `aria-current="page"` on active nav links in `MemberBottomNav` and all three `NavLink` usages in `ApplicationShell` — a repeat accessibility finding first flagged Council Review 9, still open through Review 10.
- Adds a `PageLoadingSkeleton` component wired via Next.js's `loading.tsx` convention at `app/app`, `app/portal`, and `app/control`, closing the other half of the same Review 9/10 finding (zero visual feedback during server-side data fetches).
- Adds 14 new tests covering `parseCsv`, `parseXlsx`, `parsePlainText`, and `detectFormat` in `lib/finance-import.test.ts` (13 → 27 total) — the four functions the finance-import wizard's first step actually calls, previously untested.
- Adds a `communication_dlq` table (RLS-scoped via the existing `can_manage_communications()` helper) so communication retries that exhaust their retry budget leave a durable record instead of silently staying `status='failed'` forever. Backend-only by design, no UI.
- Runs Council Review 12, a full whole-app audit (4 agents), confirming this branch's fixes work in source (not just commit messages) and reconfirming MVP readiness at 65/100 for a fourth consecutive round. See `docs/reviews/2026-09-20-council-review-12-synthesis.md`.

### Verification

- `npm run typecheck` — clean.
- `npx vitest run` — 1447/1447 passing.
- `npm run audit:rls` — clean, 114/114 `church_id`-bearing tables including the new `communication_dlq`.
- `npm run lint` — 0 errors, 7 pre-existing warnings unrelated to this branch.
- `npm run build` — clean, all routes compiled.
- Documenter close-out complete: `DEVELOPMENT_PLAN.md`, `CHANGELOG.md`, and memory updated to reflect verified status — see `docs/factory-runs/2026-09-20-webhook-dlq-finance-tests-aria-skeleton-council-review-12.md`.

### Residual risk / follow-up

- Deferred, non-blocking findings from Council Review 12: no intermediate `error.tsx` boundaries at `app/app`/`app/portal`/`app/control`; a plausible-but-unverified nested-`loading.tsx` gap in deeper member subroutes; finance-import's batch-commit/GL-posting workflow still has no test coverage; no audit-trail verification test for erasure completion (carried from Review 9); `communication_dlq` has no alerting/dashboard (explicit non-goal, not a gap).
- MVP readiness unchanged at 65/100 (Reviews 9–12 agree). Phase A is GO; Phase B–D remain NO-GO pending an uncoached pilot church, per `docs/plans/mvp-competitive-go-no-go-checklist.md`.

### Council reference

Council Review 12 synthesis: `docs/reviews/2026-09-20-council-review-12-synthesis.md`. Documenter sign-off: confirmed, this PR.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
