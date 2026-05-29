# Factory Run: Spanish I18n Hardcoded UI Passes

Date: 2026-05-29

## Intent

Reduce remaining hardcoded English UI copy on active product surfaces while reusing the existing English/Spanish i18n system already present in the app.

## Factory Workflow

- Workflow: churchcore-build-with-tests
- Process: identify high-string-density views, add minimal `useI18n()` wiring, extend shared locale messages, validate with lint/build, then continue to the next slice.

## Story and Acceptance Criteria

- Replace remaining hardcoded user-facing strings in high-traffic views with shared i18n lookups.
- Keep the existing English/Spanish locale pattern in `lib/i18n.ts`.
- Preserve current behavior while making dates and currency formatting locale-aware where touched.

## Technical Brief

- Reused the existing `I18nProvider` / `useI18n()` pattern instead of introducing a new translation layer.
- Added new `financeJournal`, `memberSchedule`, `financeImport`, and `publicGiving` namespaces under both `messages.en` and `messages.es`.
- Updated touched components to use translated labels, notifications, progress states, and locale-aware amount/date formatting.

## Implementation Summary

- Updated `components/application/finance-journal-editor.tsx`.
- Updated `components/application/member-schedule.tsx`.
- Updated `components/application/finance-import-wizard.tsx`.
- Updated `components/application/public-giving-page.tsx`.
- Updated `lib/i18n.ts` with the new message groups.
- Updated `CHANGELOG.md` for traceability.

## Verification

Executed and passed:

- `npm run lint`
- `npm run build`

## Residual Risk

- Many components still contain hardcoded English strings outside these passes; this run intentionally focused on the highest-density active views first.
- A broader repo-wide i18n sweep should continue incrementally to avoid mixing large translation churn with unrelated feature work.

## Delivery

- Branch: pending
- Pull request: pending
- Merge: pending
