# ChurchCore Release Checklist

Run these gates before any production deploy. All must pass.

## Pre-merge (every PR) — automated in CI

These run automatically on every PR via `.github/workflows/ci.yml` and block merge:

- `npm run test:surfaces` — every page, API route, and server action is registered in `tests/coverage-manifest.json` with real tests behind it (no unregistered, stale, or untested surfaces)
- `npm run lint` — zero errors on source files
- `npm run build` — TypeScript clean, all routes compile
- `npm run test` — all unit tests pass (Vitest)
- `npm run audit:rls` — against a freshly reset local Supabase
- **`e2e` job** (4 shards) — `supabase/scripts/setup-e2e.sh` brings up both local stacks (tenant + control plane) with seed data and demo users, then Playwright runs:
  - the page×role sweep: every page for every role and signed out (allowed roles render cleanly, denied roles are redirected, no error screens or console errors)
  - API contract tests for all 15 routes (cron, webhook, unsubscribe, session, demo)
  - the readiness, member-mobile, and onboarding journeys
  - the server-reference check that locked-down actions stay unexposed (`npm run check:server-reference-manifest`)

Required status checks (`verify` and the four `e2e` shards) are a GitHub branch-protection setting a repo admin must enable; see `docs/testing.md`.

## Pre-release (before promoting to production) — manual gates

- [ ] `npm run smoke:preview` against the preview deployment — all smoke checks pass
- [ ] `npm run lint:migrations` — zero migration linter errors
- [ ] `npm run check:schema` — no phantom tables (`burnout_category_counts` and `discipleship_velocity` are known expected phantoms)
- [ ] `npm run test:db` — real-Postgres integration tests pass against a local Supabase

## Security gates
- [ ] gitleaks secret scan passes in CI
- [ ] GitHub dependency review passes in CI (no critical CVEs unaddressed)
- [ ] Security role-access matrix is current (`docs/security-role-access-matrix.md` updated for any new routes/actions)

## Documentation gates
- [ ] `CHANGELOG.md` has an entry for this release
- [ ] `docs/application-guide.md` reflects new features
- [ ] `README.md` release section updated if major feature lands

## Post-deploy
- [ ] Sign in at `/sign-in` and reach `/app/church-admin/readiness` successfully
- [ ] Check Vercel function logs for any uncaught errors in the first 15 minutes
- [ ] Confirm Stripe, Resend, and Twilio webhook deliveries appear in provider dashboards
