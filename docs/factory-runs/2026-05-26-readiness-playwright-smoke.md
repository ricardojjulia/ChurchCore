# Factory Run: Readiness Playwright Smoke

**Date:** 2026-05-26  
**Factory surface:** Codex  
**Workflow:** `churchcore-feature-factory` with `churchcore-build-with-tests` implementation discipline  
**Roadmap phase:** Competitive Readiness Phase 1, Finish The Operator Path  
**Status:** Merged

## Intent

Add browser-level Playwright coverage for the ChurchAdmin weekly readiness path so route checks prove browser sign-in, app context, hydration, and target page rendering instead of only curl-level HTTP responses.

## Story And Acceptance Criteria

As a ChurchAdmin evaluator, I want a browser smoke test for the weekly readiness route path, so regressions in sign-in, route hydration, or target route rendering are caught before the operator path is called usable.

Acceptance criteria:

- The repo has a Playwright test command for the ChurchAdmin readiness path.
- The test signs in through the real browser-rendered sign-in page.
- The test hydrates the ChurchAdmin church context used by the local demo.
- The test opens `/app/church-admin/readiness`.
- The test visits each current readiness target route covered by `npm run smoke:local`.
- Documentation explains that the test requires local Supabase demo credentials.
- Delivery uses branch and pull request workflow.

## Technical Brief

- Add `@playwright/test` as a mainstream dev dependency for browser e2e coverage.
- Add `playwright.config.ts` with Chromium-only coverage and a reusable `webServer` hook that starts `npm run dev` when needed.
- Add `tests/e2e/church-admin-readiness.spec.ts` for the route-by-route readiness path.
- Load `.env`, `.env.local`, and `.demo-credentials.local` in the test process so the same local demo credentials used by shell smoke are available.
- Keep this as an explicit e2e command instead of adding it to the default lint/build path because it requires the local Supabase demo setup.

## Implementation Summary

Files changed:

- `.gitignore`
- `package.json`
- `package-lock.json`
- `playwright.config.ts`
- `tests/e2e/church-admin-readiness.spec.ts`
- `README.md`
- `CHANGELOG.md`
- `docs/application-guide.md`
- `docs/mvp-readiness-audit.md`
- `docs/plans/competitive-readiness-roadmap.md`
- `docs/testing-schema.md`
- `docs/factory-runs/README.md`
- `docs/factory-runs/2026-05-26-readiness-playwright-smoke.md`

Patterns reused:

- Existing local demo sign-in credentials from `.demo-credentials.local`.
- Existing ChurchAdmin app-context cookie shape from `supabase/scripts/smoke-demo.sh`.
- Existing readiness target route list from the local smoke path.
- Existing factory-run tracking format.

## Verification

- `npm run test:e2e:readiness` - failed first because Playwright Chromium was not installed.
- `npm run test:e2e:install` - passed.
- `npm run test:e2e:readiness` - failed next because no server was listening before the Playwright web server hook existed.
- `npm run test:e2e:readiness` - failed next on a strict Mantine password selector; fixed by targeting the password textbox role.
- `npm run test:e2e:readiness` - passed, 1 Chromium test.
- `git diff --check` - passed.
- `npm run lint` - passed.
- `npm run build` - passed.

## Residual Risk

- This browser smoke covers route traversal and visible text, not every readiness resolution action.
- It requires the local Supabase demo environment and generated demo credentials.
- Denied-role browser checks are still a follow-up under the operator-path and security-proof roadmap.

## Delivery

- Branch: `test/readiness-playwright-smoke`
- Pull request: [#29](https://github.com/ricardojjulia/ChurchCore/pull/29)
- Merge: squash merge `4608bf8`
