# Council Synthesis: Governance and Full UI Verification

**Date:** 2026-09-19
**Branch:** `fix/governance-and-ui-verification`
**Status:** Approved by the user; all required findings resolved

## Scope

The Council reviewed the full branch diff against `origin/main`: software-factory governance, RLS auditing, Demo Feedback triage, preview/runtime repairs, Communications readiness, error handling, and E2E stabilization.

## Consensus

The branch is coherent and the core fixes are directionally correct. The user approved the fix proposal, and every blocking finding below has been implemented and verified.

## Approved-Fix Proposal

1. Expand the control-plane RLS audit to every expected public table. Require RLS everywhere and policies everywhere except the explicitly documented service-role-only rate-limit table.
2. Make feedback mutation updates detect missing rows and return `404`; add regression coverage.
3. Return an explicit Demo Feedback availability/error model instead of collapsing outages into an empty queue; render a warning state.
4. Add visible mutation-failure feedback after optimistic rollback.
5. Make Communications navigation role-aware and classify no-backend sessions correctly; add page/role tests.
6. Improve `DemoErrorBoundary` with route-change reset and safe Home/Reload recovery actions; extend tests.
7. Add the missing control-plane database integration tests for RLS denial, concurrency rate limiting, deduplication, and reopen behavior.
8. Add Codex and Gemini translation-skill entrypoints aligned with the existing Claude skill.
9. Correct `DEVELOPMENT_PLAN.md` to reflect Phase B GO and identify the actual next coding priorities. Record that this Council ran after initial implementation as an explicit process exception.

## ADR Decision

No new architectural decision is required. The proposed fixes enforce existing ADRs and documented boundaries.

## Resolution

1. The control-plane audit now checks all seven expected public tables and permits zero policies only for the documented service-role-only rate-limit table.
2. Feedback updates return `404` for stale identifiers and have route regression coverage.
3. Feedback reads distinguish ready, unavailable, and error states; the workspace renders explicit warnings and reports failed optimistic mutations.
4. Communications uses role-aware home navigation and reports preview mode when tenant backend configuration is absent, with role and readiness tests.
5. The demo error boundary resets after navigation and offers safe workspace and reload recovery actions.
6. A live control-plane integration test covers concurrent rate limiting, fingerprint deduplication, reopen behavior, and wrong-role RLS denial.
7. Codex and Gemini now expose guarded entrypoints to the canonical translation workflow.
8. `DEVELOPMENT_PLAN.md` now treats Phase B and Phase C as complete and identifies uncoached external evaluation as the next gate.
9. This Council's post-implementation sequencing is recorded as a process exception in the factory-run record.

## Required Verification

- Focused unit and control-plane integration tests.
- Live tenant and full control-plane RLS audits.
- `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build`.
- Playwright coverage for affected Communications, Member, readiness, and onboarding paths.
- Final `churchcore-pr-review` after Documenter close-out.

## Verification Result

All required gates passed: 1,429 unit tests, lint with seven known warnings and no errors, type checking, production build, tenant and seven-table control-plane RLS audits, control-plane feedback integration, and nine runnable Playwright scenarios. One control-context browser scenario remains intentionally skipped until a control-plane test identity exists.

## Phase Direction

The active `docs/plans/mvp-competitive-go-no-go-checklist.md` records Phase B and Phase C as GO and all buildable Phase D gates as closed. After this branch merges, the next gate is an uncoached external evaluator session. New coding work should be created from observed evaluator blockers, not by restarting completed service-planning or import work.
