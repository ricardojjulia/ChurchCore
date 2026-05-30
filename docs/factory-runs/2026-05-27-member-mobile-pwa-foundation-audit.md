# Factory Run: Member Mobile PWA Foundation Audit

**Date:** 2026-05-27  
**Factory surface:** Codex  
**Workflow:** `churchcore-feature-factory` with `churchcore-build-with-tests` implementation discipline  
**Roadmap phase:** Competitive Readiness Phase 2, Harden Mobile Member Workflows  
**Status:** Delivered

## Intent

Start Phase 2 with a mobile-first audit pass before implementing member check-in foundations, so check-in is not built into a desktop-leaning member surface.

## Story And Acceptance Criteria

As a ChurchCore operator and evaluator, I want a documented mobile member baseline and executable phone-sized browser checks, so the team can sequence member mobile implementation without ambiguity.

Acceptance criteria:

- Audit `/app/member/*` and `/app/calendar` at phone viewport intent.
- Document the intended mobile member workflow order.
- Classify routes as mobile-safe, hardening needed, or redesign needed.
- Define first implementation slices for mobile home, schedule, groups, directory/privacy, giving history, family/profile updates, notification preferences, and member self-check-in entry.
- Add baseline phone-sized Playwright coverage for member routes and calendar.
- Add a baseline member denied-route mobile check for ChurchAdmin-only readiness.
- Update roadmap/changelog/factory tracker docs.

## Technical Brief

- Documentation first: capture the route audit and execution slices in a plan artifact under `docs/plans/`.
- Keep role boundaries unchanged; this run should not broaden member access.
- Add a new Playwright e2e spec focused on mobile viewport verification and baseline role access.
- Reuse existing local-demo credential conventions from readiness browser tests.
- Update roadmap and tracker docs to mark Phase 2 as started through the audit run.

## Implementation Summary

Files changed:

- `docs/plans/member-mobile-pwa-foundation-audit.md`
- `tests/e2e/member-mobile-foundation.spec.ts`
- `docs/plans/competitive-readiness-roadmap.md`
- `docs/factory-runs/README.md`
- `README.md`
- `CHANGELOG.md`
- `docs/factory-runs/2026-05-27-member-mobile-pwa-foundation-audit.md`

Patterns reused:

- Existing software-factory run record format.
- Existing local-demo e2e env loading/sign-in approach from readiness browser coverage.
- Existing route-level mobile shell expectation via `ApplicationShell` burger/menu behavior.

## Verification

- `npm run test:e2e -- tests/e2e/member-mobile-foundation.spec.ts`
- `npm run lint`
- `npm run build`
- `git diff --check`

## Residual Risk

- This run establishes baseline route safety, not final mobile UX quality.
- `/app/calendar` remains technically usable but is still not a member-first mobile layout.
- Member ministries and data-rights flows still require intentional phone-first visual hierarchy and tighter state messaging in follow-up runs.

## Delivery

- Branch: `feature/member-checkin-location-policy` (consolidated software-factory branch)
- Pull request: Not opened (local merge-commit flow used for this run batch)
- Merge: `d7a1969`
