# Dependency Security Patch — 2026-09-17

**Scope:** GitHub flagged 57 Dependabot alerts on `main` (4 critical, 31 high, 21 moderate, 1 low). The initial patch (PR #136) resolved 54; the remaining 3 (moderate, dev-only) were deliberately deferred and resolved the same day in a follow-up (see below). `npm audit` now reports 0 vulnerabilities.

Not run as a full Council review (`improve-software.md` §0's "small, isolated" exception): this is a mechanical dependency-version change with no application-code intent behind it, verified by the full lint/build/test suite rather than the 4-agent audit, which is scoped to app architecture/UX/product-completeness questions that don't apply here.

## What Was Fixed

- **`next` 16.2.6 → 16.3.5** (a SemVer *minor* bump — same major, `isSemVerMajor: false` per npm's own audit output, but minor, not patch — 16.2.x → 16.3.x). Resolves 4 critical (2x unauthenticated RCE in Image Optimization/AVIF handling and windows-hosted servers), several high (SSRF in Server Actions/rewrites, DoS in App Router Server Actions), and medium findings, plus the `postcss`/`sharp` high-severity findings that are bundled as `next`'s own nested dependencies.
- **`eslint-config-next` 16.2.6 → 16.3.5**, kept in lockstep with `next` (mismatched majors between these two break linting).
- **`npm audit fix`** (non-force) resolved the remaining transitive/dev-tooling findings within their existing declared ranges: `@xmldom/xmldom`, `brace-expansion`, `browserslist`, `js-yaml`, `nanoid`, `tar`, `vite`, `@babel/core` (and its sub-packages), `fflate`, `@humanfs/*`, `baseline-browser-mapping`, and the `supabase` CLI dev dependency (2.89.1 → 2.117.0). None of these required a `package.json` range change — `npm audit fix` alone resolved them by picking newer versions already satisfying the declared semver ranges.

## Resolved (was deferred): vitest 4 → 5 (3 moderate findings)

`@vitest/mocker`'s path-traversal/arbitrary-file-read advisory (`GHSA-82fw-gwwq-j7x9`) is fixed in vitest 5.x, but vitest 5 has a **hard peer dependency on `@types/node` ^22 or >=24** — we were on `^20`. Deferred out of this patch at the time since it wasn't a small change to verify inside a security patch.

**Real-world risk assessment:** low. The vulnerable code path is a local dev-server mock-redirect feature in `@vitest/mocker`, not something exposed in production or CI in a way an external attacker could reach. Deferring was a judgment call about priority, not about acceptability.

**Resolution (same day, follow-up branch `chore/vitest-5-types-node-22`):** `.nvmrc` already pinned Node `22.13.0`, so bumping `@types/node` to `^22` was catching the type surface up to a runtime version already in use, not a speculative jump — smaller and lower-risk than it looked from inside the original patch. Bumped `@types/node` `^20` → `^22` and `vitest`/`@vitest/coverage-v8` `^4.1.8` → `^5`. No code changes were needed anywhere in the codebase; `npm run lint`, `npm run typecheck`, `npm run build`, and all 1339 tests pass unchanged. `npm audit` now reports 0 vulnerabilities.

## Two Latent Bugs Surfaced (Unrelated to the Version Bump's Intent)

The `next` bump invalidated a stale incremental TypeScript cache (`tsconfig.tsbuildinfo`, gitignored, present from earlier work in this environment) and, separately, revealed a time-bomb test. Neither was caused by this patch — both predate it and would have failed on `main` regardless, once triggered by cache invalidation or the calendar clock:

1. **`next build`'s typecheck now covers files an old cache was silently skipping.** ~24 pre-existing type errors surfaced across 10 test files (`*.test.ts`/`*.test.tsx`) unrelated to this patch's scope — test fixtures drifted from their types over time (e.g. `GroupCategory` narrowing, `DemoFeedbackRow` missing fields, tuple-destructuring inference in `.find()` predicates). Added `tsconfig.build.json` (extends the root config, excludes `**/*.test.ts(x)` and `tests/e2e/**`) and pointed `next.config.ts`'s `typescript.tsconfigPath` at it, so a production build isn't gated on test-file type correctness. **Update:** an automated review on PR #136 correctly flagged that this alone silently dropped test-file type enforcement entirely — `npm run test` is just `vitest run`, and Vitest transpiles test files without type-checking them, so nothing was left checking those 24 errors anywhere. Added `npm run typecheck` (`tsc --noEmit` against the full `tsconfig.json`, test files included) wired into `npm run check` / CI's Verify step, and fixed all ~24 errors it surfaced rather than leaving them as tracked debt.
2. **`components/application/calendar-live-board.test.tsx` hardcoded `new Date()`-dependent assertions against fixture events pinned to `2026-06-07`,** with a test comment literally noting it relied on "the real current date (June 2026 per env)". Failed as soon as the suite ran on any day outside June 2026 — today is 2026-09-17. Same class of bug as the `volunteer-actions.test.ts` fix from the Council Review 9 pass earlier today. Fixed with `vi.useFakeTimers()` / `vi.setSystemTime("2026-06-07T12:00:00Z")` pinned to the fixture date (both month- and week-view assertions needed the pin to land in the same week, not just the same month).

## Verification

`npm run check` (lint + typecheck + build, 0 errors), `npm run test` (1339/1339 passing on this branch — based on `main`, which doesn't yet include PR #135's additional test files). 5 pre-existing lint warnings remain (unrelated to this patch): 3 are a newly-surfaced `next` lint rule, `no-location-assign-relative-destination`, flagging pre-existing `window.location.href` usage.

## Follow-up Tracked

- 3 pre-existing `no-location-assign-relative-destination` warnings (`finance-budget-workspace.tsx`, `groups-workspace.tsx`, `volunteer-schedule.tsx`) surfaced by the new `next` version's lint rule set.
