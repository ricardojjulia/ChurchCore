# Factory run: T1a — Untested exports: giving, finance, comms (2026-10-07)

**Plan row:** `DEVELOPMENT_PLAN.md` §0 T1a (Must, 1 day, M3). **Branch:** `test/untested-exports-t1a`, commit `fd75b4e`.

## Intent
Take the giving, finance and communications action modules to zero `untestedExports` waivers in `tests/coverage-manifest.json`, so the money and messaging paths are covered before M3 (Oct 23).

## What changed
- Tests for the four waived exports in scope: finance `createBudgetAction`, `deleteJournalDraftAction`, `upsertBudgetLinesAction`; communications `getCommunicationDeliveryEventsAction`. Their waivers are removed. The giving modules (giving-actions, giving import actions, statements-actions, donations-actions, recurring-gifts-actions, stripe-connect-actions) already had zero waivers. Manifest-wide waivers: 58 to 54 (62 at Review 18).
- Real bugs found by the tests, fixed in `app/app/finance-actions.ts`:
  - Post, void and delete-draft journal and upsert budget lines never read the Supabase error or affected-row count, so an RLS or constraint refusal, a cross-church id, or an already-posted journal reported success. They now `.select("id")`, throw the error, and treat zero rows as "Journal not found, or it is no longer a draft." / "Journal not found."
  - Budgets: name required (trimmed), fiscal year 2000-2100, lines need `accountId` and integer `amountCents` >= 0, and the budget must belong to the session church before any line is written ("Budget not found.").

## Architecture impact
None. No new modules, tables, routes or migrations; behavior changes are confined to `finance-actions.ts` error handling and input validation. Same unchecked-write class as S14 and Council Review 31.

## Verification (orchestrator-run, on `fd75b4e`)
- `npx vitest run`: 208 files, 2,646 tests, 0 failures, 0 `it.fails`.
- `npm run test:surfaces`: OK. `npm run lint`: 0 errors (1 pre-existing warning). `npx tsc --noEmit`: clean.
- **Not verified:** CI (`verify` and the four `e2e` shards) has not run because no PR exists yet; GitHub's automated PR review has not run.
- Council skipped under `improve-software.md` §0's exception (tests plus small single-module fixes with tests), as for #185 and #189.

## Residual risk
- `voidJournalAction` still voids any journal of the church regardless of status (pre-existing). Tracked as S23 (Should).
- Journal-line cascade on delete is not observable in a unit test (mocked client); an e2e or database test would be needed.
- 54 waivers remain in other modules: `app/app/actions.ts` 18, `elders-actions` 8, `ccm-actions` 6, `church-admin-actions` 6, `groups-actions` 6, `calendar/actions` 3, `church-admin/operations/actions` 2, `control/actions` 2, and one each in `volunteer-actions`, `portal/actions`, `portal/children/actions`. Child safety and pastoral are T1b.

## Follow-up
Open the PR and get `verify` plus the `e2e` shards green; read GitHub's review before merging. M3 is met on merge. Then M4 (G2.1, G2.2, G4.1, G4.2), T1b, S23.
