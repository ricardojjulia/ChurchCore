# Factory Run: Readiness Denied-Role Playwright

**Date:** 2026-05-26  
**Factory surface:** Codex  
**Workflow:** `churchcore-feature-factory` with `churchcore-build-with-tests` implementation discipline  
**Roadmap phase:** Competitive Readiness Phase 1, Finish The Operator Path  
**Status:** Pull request pending

## Intent

Add browser-level denied-role proof for ChurchAdmin-only readiness routes so the weekly operator path is not only reachable by ChurchAdmin but also blocked from tenant roles that should not operate it.

## Story And Acceptance Criteria

As a security reviewer, I want tenant role browser checks for ChurchAdmin-only readiness targets, so Secretary, Pastor, Ministry Leader, and Member users cannot see protected ChurchAdmin readiness content.

Acceptance criteria:

- Local setup creates demo auth users for ChurchAdmin, Secretary, Pastor, Ministry Leader, and Member.
- The readiness Playwright suite still proves the ChurchAdmin happy path.
- The readiness Playwright suite signs in as Secretary and Member and confirms they cannot see ChurchAdmin-only readiness target content.
- The readiness Playwright suite signs in as Pastor and Ministry Leader and confirms they cannot see ChurchAdmin-only readiness target content.
- The ChurchAdmin event readiness target is restricted to ChurchAdmin for the list route.
- Docs and the roadmap distinguish tenant-role coverage from the still-pending local control-plane browser coverage.

## Technical Brief

- Extend `supabase/scripts/create-dev-users.sh` with local pastor and ministry-leader demo accounts.
- Align `supabase/seed.sql` so auth-trigger-created profiles for the new demo users do not collide with fixed demo profile IDs.
- Extend `tests/e2e/church-admin-readiness.spec.ts` with tenant denied-role checks.
- Decode URL-encoded app-context cookies in `lib/auth.ts` so browser-set context values are parsed safely.
- Restrict `/app/church-admin/events` to ChurchAdmin because it is a ChurchAdmin readiness target list route.
- Keep Control Plane browser denied-route coverage as a documented follow-up until the separate local control-plane demo is provisioned.

## Implementation Summary

Files changed:

- `app/app/church-admin/events/page.tsx`
- `lib/auth.ts`
- `supabase/scripts/create-dev-users.sh`
- `supabase/seed.sql`
- `tests/e2e/church-admin-readiness.spec.ts`
- `README.md`
- `CHANGELOG.md`
- `docs/application-guide.md`
- `docs/setup/local-supabase.md`
- `docs/mvp-readiness-audit.md`
- `docs/plans/competitive-readiness-roadmap.md`
- `docs/testing-schema.md`
- `docs/factory-runs/README.md`
- `docs/factory-runs/2026-05-26-readiness-denied-role-playwright.md`

Patterns reused:

- Existing Playwright readiness suite and local demo credential loading.
- Existing route-level redirect guards using `session.homePath`.
- Existing factory-run tracking format.

## Verification

- `npm run test:e2e:readiness` - failed first because pastor/ministry/control synthetic contexts still saw ChurchAdmin readiness content.
- `npm run setup:local` - failed after adding Robert as a demo auth user because the auth trigger created a duplicate `profiles.email` before the fixed-ID seed insert.
- Root cause fixed by aligning Robert's auth-trigger-created profile to the deterministic demo profile ID before the bulk insert.
- `npm run setup:local` - passed after the seed alignment.
- `npm run test:e2e:readiness` - passed for ChurchAdmin happy path plus Secretary, Member, Pastor, and Ministry Leader denied-role checks; Control Plane browser check remains skipped.
- `git diff --check` - passed.
- `npm run lint` - passed.
- `npm run build` - passed.

## Residual Risk

- Control Plane denied-route browser coverage remains pending because local control-plane auth users are provisioned separately from the tenant demo.
- The denied-role suite checks route content visibility and redirects; it does not yet exercise every resolution action on target pages.

## Delivery

- Branch: `test/readiness-denied-role-playwright`
- Pull request: pending
- Merge: pending
