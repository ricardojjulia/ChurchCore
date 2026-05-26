# Factory Run: Readiness Route Smoke

**Date:** 2026-05-26  
**Factory surface:** Codex  
**Workflow:** `churchcore-feature-factory` with `churchcore-build-with-tests` implementation discipline  
**Roadmap phase:** Competitive Readiness Phase 1, Finish The Operator Path  
**Status:** Verified locally, PR pending

## Intent

Expand local smoke coverage so the ChurchAdmin weekly readiness path proves each current readiness target route resolves after sign-in.

## Story And Acceptance Criteria

As a ChurchAdmin evaluator, I want `npm run smoke:local` to walk the readiness target routes, so a broken target link or authorization redirect is caught before claiming the weekly operator path is usable.

Acceptance criteria:

- The local smoke path signs in as the ChurchAdmin demo user.
- The smoke path still opens `/app/church-admin/readiness`.
- The smoke path verifies each current readiness target route:
  - church setup
  - portal account requests
  - incomplete people records
  - unassigned households
  - events without roster coverage
  - children's ministry readiness
  - unassigned volunteer schedules
  - giving and finance exceptions
  - draft finance journals
  - communications readiness
  - reports readiness
  - suggested workflows
- Documentation distinguishes local curl-based route coverage from future browser-level Playwright coverage.
- Delivery uses branch and pull request workflow.

## Technical Brief

- Extend `supabase/scripts/smoke-demo.sh` with direct `require_contains` assertions for every current readiness target route.
- Reuse the existing signed-in ChurchAdmin cookie and app-context setup.
- Keep the smoke script dependency-free.
- Do not change route behavior, role access, or seed data.

## Implementation Summary

Files changed:

- `supabase/scripts/smoke-demo.sh`
- `CHANGELOG.md`
- `docs/mvp-readiness-audit.md`
- `docs/plans/competitive-readiness-roadmap.md`
- `docs/factory-runs/README.md`
- `docs/factory-runs/2026-05-26-readiness-route-smoke.md`

Patterns reused:

- Existing `require_contains` smoke helper.
- Existing ChurchAdmin local sign-in and app-context cookie setup.
- Existing factory-run tracking format.

## Verification

- `bash -n supabase/scripts/smoke-demo.sh` - passed.
- `git diff --check` - passed.
- `npm run lint` - passed.
- `npm run build` - passed.
- `npm run smoke:local` - not run; no local Next.js server was listening on `localhost:4200` in this session.

## Residual Risk

- This run adds curl-based route coverage, not browser-level Playwright coverage.
- `npm run smoke:local` requires the local Supabase and Next.js demo environment to be running with generated demo credentials.

## Delivery

- Branch: `test/readiness-route-smoke`
- Pull request: pending
- Merge: pending
