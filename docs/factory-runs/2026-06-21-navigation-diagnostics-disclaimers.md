# Factory Run: Navigation, Diagnostics, and AI Disclaimer Hardening (Council Review 5)

**Date:** 2026-06-21
**Factory surface:** Gemini (Antigravity)
**Workflow:** `gemini-feature-factory`, `gemini-build-with-tests`
**Status:** Implemented locally; build and test verification passing

## Intent

Implement the sprint closeout/planning improvements defined in Council Review 5:
- **Prompt A:** Automate active sidebar navigation link highlighting inside the Application Shell.
- **Prompt B:** Secure the control plane database health diagnostic endpoint with timeouts and telemetry caching.
- **Prompt C:** Enforce persistent AI theological disclaimers across outline rendering, copy-paste interfaces, and print layouts.

## Story and Acceptance Criteria

1. **UX & Navigation Refinement (Prompt A):**
   - Automatically resolve the `active` highlight state of navigation links in `ApplicationShell` using Next.js `usePathname()`.
   - Ensure it matches sub-routes (e.g. highlights a parent tab when on a child page).
   - Fully cover the refactoring with robust unit tests.
2. **Platform Diagnostics & Health Security (Prompt B):**
   - Wrap database connection queries in a 2-second `Promise.race` rejection logic inside `/api/control/db-health`.
   - Prevent database connection pool exhaustion by caching connection and status metrics in Next.js server memory for 10 seconds.
   - Enforce 500 status timeouts under load. Test with Vitest fake timers.
3. **Persistent AI Disclaimers & Attribution (Prompt C):**
   - Enforce the canonical `ELDER_AI_DISCLAIMER` suffix on all generated sermon outlines and Bible study response footnotes.
   - Link client-side alerts in `bible-study-client.tsx` and `sermon-outline-modal.tsx` to `.ai-disclaimer-badge`.
   - Implement `@media print` CSS rules in `app/globals.css` ensuring `.ai-disclaimer-badge` stays visible when pages are printed or saved to PDF.

## Technical Brief

- **App Shell Navigation:** Refactored `components/application/app-shell.tsx` to dynamically query active paths. Added `components/application/app-shell.test.tsx` verifying that pathname routing matches exact and nested page segments. Exported `ShellNavItem` type for static testing safety.
- **Database Health Check Caching:** Reconfigured `app/api/control/db-health/route.ts` with local variables `cachedData` and `cacheExpiry` (initialized outside the handler context). Set `Promise.race` matching a 2000ms timer rejection and simulated database responses. Tests mock database latency to assert connection caching and timeout logic.
- **AI Disclaimers and CSS Print Media Rules:** Appended the warning strings directly to server-returned outline/footer fields in `app/app/elders-actions.ts`. Styled with a print media selector in `app/globals.css` ensuring browser printing keeps disclaimers visible. Updated all action test cases to match the formatted disclaimer suffix.

## Implementation Summary

Created/Modified files:
- `app/api/control/db-health/route.ts` [MODIFY]
- `app/api/control/db-health/route.test.ts` [MODIFY]
- `app/app/elders-actions.ts` [MODIFY]
- `app/app/elders-actions.test.ts` [MODIFY]
- `app/globals.css` [MODIFY]
- `components/ai/sermon-outline-modal.tsx` [MODIFY]
- `components/ai/sermon-outline-modal.test.tsx` [MODIFY]
- `components/application/app-shell.tsx` [MODIFY]
- `components/application/app-shell.test.tsx` [NEW]
- `components/application/bible-study-client.tsx` [MODIFY]
- `CHANGELOG.md` [MODIFY]

## Verification

- **Production Build:** Next.js Turbopack production compilation (`npm run build`) completed successfully with zero compile or TypeScript errors.
- **Linter:** `npm run lint` runs completely clean with zero errors or warnings on all modified and created source files.
- **Unit Tests:** Executed `npm run test` (Vitest) successfully running all 121 test files and passing all 1,378 unit tests.

## Residual Risk

- None identified.

## Delivery

- **Branch:** `fix/people-mobile-filters`
- **Pull request:** Pending merge to `main`
