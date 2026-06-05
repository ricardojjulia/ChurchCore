# ChurchCore Release Checklist

Run these gates before any production deploy. All must pass.

## Pre-merge (every PR) — automated in CI

These run automatically on every PR via `.github/workflows/ci.yml`:

- `npm run lint` — zero errors on source files
- `npm run build` — TypeScript clean, all routes compile
- `npm run test` — all unit tests pass (Vitest)
- `npm run audit:rls` — advisory; exits 0 when DB unavailable in CI, surfaces failures when DB is reachable

## Pre-release (before promoting to production) — manual gates

E2E and smoke tests require a running local Supabase + seeded demo data. Run before any production deploy:

- [ ] `npm run smoke:local` — all smoke checks pass
- [ ] `npm run test:e2e:readiness` — 3+ passed, control-plane skip is expected
- [ ] `npm run test:e2e:onboarding` — 1 passed
- [ ] `npm run lint:migrations` — zero migration linter errors
- [ ] `npm run check:schema` — no phantom tables (`burnout_category_counts` and `discipleship_velocity` are known expected phantoms)

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
