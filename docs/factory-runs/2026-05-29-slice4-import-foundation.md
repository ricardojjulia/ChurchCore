# Factory Run: Slice 4 Migration/Import Foundation (People + Households)

Date: 2026-05-29

## Intent

Begin Finding 5 execution with a safe, deterministic people/household migration intake path that supports dry runs without production writes.

## Architecture Impact

- Added import staging schema migration `supabase/migrations/20260529011500_slice4_import_staging_foundation.sql`:
  - `import_batches`
  - `import_batch_rows`
  - RLS and management policies for ChurchAdmin workflows.
- Added dry-run import engine in `lib/people-import-dry-run.ts`:
  - parses CSV input,
  - normalizes identity signals,
  - classifies each row as `create`, `update`, `skip`, or `reject`,
  - computes household-create counts,
  - stores dry-run batch + row evidence in staging tables.
- Added ChurchAdmin server action `runPeopleImportDryRunAction` in `app/app/church-admin/people/import/actions.ts`.
- Added ChurchAdmin import intake route `/app/church-admin/people/import`:
  - `app/app/church-admin/people/import/page.tsx`
  - `components/application/church-admin-people-import-workspace.tsx`
- Added direct entry button from the people workspace top actions.

## Product Surface Updated

- ChurchAdmin can execute a dry-run CSV import for people/households and view deterministic summary counts:
  - create
  - update
  - skip
  - reject
- Dry-run output includes row-by-row reasons and persisted staging evidence (`batchId`) without mutating canonical people/household records.

## Tests

- Added `lib/people-import-dry-run.test.ts` for deterministic classification behavior.

## Verification Commands

Executed and passed:

- `npm run test -- lib/people-import-dry-run.test.ts lib/communications/provider-adapter.test.ts`
- `npm run lint`
- `npm run build`

## Residual Risk

- This slice currently supports generic CSV layout only; source-specific adapters (Planning Center/Breeze/Tithely/Pushpay/CCB) remain follow-up work.
- Dry-run classification currently uses deterministic matching heuristics (member number/email/name+phone) and should be expanded with richer duplicate-candidate review UX in later slices.
