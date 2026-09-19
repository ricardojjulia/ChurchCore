# Governance and Full UI Verification

**Date:** 2026-09-19
**Branch:** `fix/governance-and-ui-verification`
**Delivery:** Verified and ready for pull request

## Intent

Verify that `bootstrap-software-factory-prompt.md`, `feedback-and-error-triage-system-playbook.md`, and `language-translation-skill.md` are implemented in ChurchCore, then exercise the application through its real browser UI and fix defects encountered.

## Factory Workflow

The Codex `churchcore-build-with-tests` workflow was used. Repository identity, branch, remote, governing documentation, and current working-tree state were checked before edits. The pre-existing untracked `.sync.ffs_db` file was preserved. The Council ran after the initial implementation instead of before it; the user approved its synthesis before the Council fixes were applied. This is recorded as a process-sequencing exception and was not represented as full procedural conformance.

## Story and Acceptance Criteria

- Each ruling document has concrete repository implementation evidence or a clearly recorded residual gap.
- RLS auditing fails closed and covers both tenant and control-plane schemas.
- Demo-feedback triage mutations and optimistic UI behavior have regression coverage.
- Public, platform-admin, ChurchAdmin, Secretary, Pastor, Ministry Leader, and Member preview flows render through the browser.
- Runtime, hydration, and route failures discovered during the walkthrough are fixed and regression-tested.
- Lint, tests, type checking, build, and live RLS audits pass before handoff.

## Technical Brief

The work changes no tenant schema and introduces no new authorization role. Preview-mode reads now stop at the data boundary instead of attempting an unconfigured backend connection. Tenant and control-plane RLS remain separately auditable. The control-plane database is staged in a temporary parent directory in CI because Supabase expects the work directory to contain a `supabase/` child.

## Implementation Summary

- Aligned Claude, Codex, and Gemini factory governance with an explicit Claude PR-review skill, Council handoff requirement, PR template evidence, and ADR index.
- Made RLS audits fail on unavailable databases, unsupported surfaces, and missing expected tables; added live tenant and seven-table control-plane policy auditing in CI.
- Added demo-feedback route authorization/validation/error/stale-record tests, explicit unavailable and query-error states, visible optimistic-mutation failure feedback, and live database integration coverage for concurrency, deduplication, reopening, and wrong-role denial.
- Added safe no-backend control-feedback behavior, a reusable demo recovery boundary, and an explicit `undici` dependency.
- Fixed role-aware and no-backend Communications behavior, preview-mode Children's Ministry reads, Member preview date values, and browser-push hydration initialization.
- Added Codex and Gemini translation entrypoints and reconciled the roadmap so completed Phase B and Phase C work is not restarted.

## Browser Verification

Interactive Chrome verification covered the public home/sign-in flow and the primary routes for Platform SuperAdmin, Church Administrator, Secretary, Pastor/Elder, Ministry Leader, and Volunteer/Member. The repaired Member portal, Communications history, Children's Ministry dashboard, and control demo-feedback queue were reloaded after fixes and rendered successfully.

## Verification

- `npm test`: passed, 127 files and 1,429 tests.
- `npm run lint`: passed with seven pre-existing warnings and no errors.
- `npm run typecheck`: passed after rotating stale `.next/dev` generated types left by the development server.
- `npm run build`: passed; Next.js generated all 118 static-generation targets.
- `npx playwright test --workers=1`: all nine runnable scenarios passed across the seeded-local run and focused rerun; the existing control-plane denied-role scenario remains intentionally skipped. This includes the twelve-route ChurchAdmin readiness traversal, member phone routes/calendar/access denial, invalid parent-session states, and the onboarding request/approval/invite/sign-in flow.
- Interactive Chrome walkthrough: passed for public, Platform SuperAdmin, ChurchAdmin, Secretary, Pastor/Elder, Ministry Leader, and Member preview surfaces after fixes.
- `npm run audit:rls`: passed for every discovered tenant `church_id` table.
- `npm run audit:rls:control-plane`: passed for all seven expected control-plane tables; the rate-limit table is explicitly service-role-only and policy-free.
- `npm run test:control-plane-feedback`: passed against the live local control-plane database.
- Fail-closed RLS checks: unsupported audit surface and unavailable database both exited nonzero as required.

## Residual Risk

- The browser walkthrough used preview accounts; provider-backed email/SMS/push delivery and production credentials were not exercised.
- The required human native-Spanish review and broad untranslated UI surface remain open per ADR 0009 and `docs/plans/spanish-ui-coverage.md`.
- The control-context Playwright scenario remains intentionally skipped until a dedicated control-plane test identity exists.
- Provider-backed email/SMS/push delivery, the human native-Spanish review, and the smaller engineering backlog remain outside this branch.

## Documenter Sign-Off

The approved Council findings are resolved, `DEVELOPMENT_PLAN.md`, `CHANGELOG.md`, `README.md`, setup/factory documentation, the Council synthesis, and this run record reflect the verified state. No ADR was required.
