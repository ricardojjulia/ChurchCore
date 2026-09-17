# Factory Run: Schema Verification, Recipient Resolver & Burnout Auditing (Council Review 6)

**Date:** 2026-06-21
**Factory surface:** Gemini (Antigravity)
**Workflow:** `gemini-feature-factory`, `gemini-build-with-tests`
**Status:** Implemented locally; build and test verification passing

## Intent

Implement the closeout/planning improvements defined in Council Review 6:
- **Prompt A:** Correct recipient resolver target table from `attendance_records` to the standard `attendance` table.
- **Prompt B:** Refactor the schema checker tool to correctly recognize Postgres Views and ignore control plane tables in the tenant schema.
- **Prompt C:** Inject audit logging hooks calling `logAuditEvent` inside the sessional burnout warning acknowledgment action.

## Story and Acceptance Criteria

1. **Communications recipient resolver query alignment (Prompt A):**
   - Standardize queries to select from the real `attendance` table instead of the non-existent `attendance_records` table inside `recipient-resolver.ts`.
   - Update tests to assert correct mock table configurations.
2. **Schema checker tool refactoring (Prompt B):**
   - Parse `create or replace view` definitions in migrations, registering views alongside tables to eliminate false-positive phantom alerts.
   - Ignore control-plane tables (such as `demo_feedback`) that are intentionally dropped from tenant schema runs.
3. **Volunteer burnout bypass audit logging (Prompt C):**
   - Inject audit logging blocks calling `logAuditEvent` inside `acknowledgeBurnoutAlertAction` in `actions.ts`.
   - Verify auditing behavior with unit tests inside `actions.test.ts`.

## Technical Brief

- **Resolver Fix:** Replaced `attendance_records` queries with `attendance` in `recipient-resolver.ts` and resolved mocks.
- **View Check Refactoring:** Extended the migration parsing regex in `check-schema-alignment.mjs` to capture view names and added an ignored tables set.
- **Burnout Auditing:** Added `logAuditEvent` calls to the burnout alert acknowledgment pipeline and asserted call expectations in `actions.test.ts`.

## Implementation Summary

Created/Modified files:
- `lib/communications/recipient-resolver.ts` [MODIFY]
- `lib/communications/recipient-resolver.test.ts` [MODIFY]
- `scripts/check-schema-alignment.mjs` [MODIFY]
- `app/app/actions.ts` [MODIFY]
- `app/app/actions.test.ts` [MODIFY]
- `CHANGELOG.md` [MODIFY]

## Verification

- **Schema Check Alignment:** `npm run check:schema` completes with exit code 0 (`check:schema PASSED — no phantom tables`).
- **Production Build:** Next.js Turbopack production compilation (`npm run build`) completed successfully with zero compile or TypeScript errors.
- **Linter:** `npm run lint` runs completely clean with zero errors or warnings on all modified and created source files.
- **Unit Tests:** Executed `npm run test` (Vitest) successfully running all test files and passing all 1,381 unit tests.

## Residual Risk

- None identified.

## Delivery

- **Branch:** `fix/people-mobile-filters`
- **Pull request:** Pending merge to `main`
