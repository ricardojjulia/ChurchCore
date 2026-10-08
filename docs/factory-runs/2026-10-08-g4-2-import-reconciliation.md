# Factory run: G4.2 — post-import reconciliation report (2026-10-08)

**Plan row:** `DEVELOPMENT_PLAN.md` §0 G4.2 (Must, 1.5 days, M4). **Branch:** `feat/import-reconciliation-g4-2`, commits `8feb3c3` (backend), `ecbd266` (frontend), `dcc6c14` (Council fixes), on top of `main` `b8b953e` (G4.1, merged as #194). **Council:** Review 46, AMENDED, R1-R10 fixed ([synthesis](../reviews/2026-10-08-council-review-46-synthesis.md), [agent reports](../reviews/2026-10-08-council-review-46-agents-1-5.md)). **Migration:** `20261009000000_import_row_commit_outcomes.sql`.

## Intent
After a migration, a church admin needs proof that what ChurchCore saved matches the file they imported. G4.2 adds a reconciliation report for every committed import: counts per entity, giving totals against the source file, every row that did not land as the file says, and a downloadable CSV. Together with G4.1 it closes Gap 4 (migration from incumbents, with reconciliation), once CI is green on merge.

## Owner decisions (2026-10-07)
- **"Changed since import" is a separate list and does not count against the import.** A mismatch is only what the import itself failed to do: a row expected to be written that failed, or a written record whose stored values at commit differ from the source. A gift edited, a record deleted or a person merged after the commit is listed apart. That required snapshotting the written values at commit.
- **The CSV is minimal:** row number, source id, classification, outcome, reason; giving adds amount, date and fund. No names, emails or phones.
- **Retention:** outcomes are kept as long as the batch exists. "Recent imports" lists the last 20 batches per import type.
- **Four brief defaults, approved with the brief:**
  1. Giving update rows are compared on amount, date and fund; an update never changes the stored date, and the page says so.
  2. A person who is already a group member counts as written, with a note (`already_member`).
  3. Rows a committed batch never reached ("not attempted") are mismatches.
  4. Giving difference is source total minus total written at commit.

## Architecture impact
- **Outcome columns** on `import_batch_rows`, all nullable, no backfill: `commit_outcome` (`written` or `failed`), `committed_record_id` (no foreign key: the target table varies and records can be deleted), `commit_failure_reason` (safe strings only), `commit_snapshot` (giving: source and stored amount, date, fund). A null outcome in a committed batch means "not attempted".
- **Column-limited admin update.** A church-admin `UPDATE` policy on `import_batch_rows`, with table-wide update revoked from `authenticated` and update granted on the four outcome columns only. The staged payload and its classification stay immutable. See [ADR 0029](../adr/0029-import-row-outcomes-column-grant-invoker-function-trigger.md).
- **`record_import_row_outcomes(p_batch_id, p_outcomes jsonb)`**, `SECURITY INVOKER` (RLS and grants apply to the caller), no actor argument, writes only rows whose outcome is still null, returns the row count. Called in chunks of 500 by an outcome recorder in `lib/import-commit.ts`; flushes are serialized, and the recorder flushes in a `finally` so a mid-batch crash keeps the outcomes already earned.
- **Immutability trigger** `import_batch_rows_commit_outcome_guard` (added in the Council fixes): for every role, outcome columns can be set only while the parent batch is `committing`, and never changed once set.
- **Summary merge.** `mergeBatchSummary` reads the current summary, spreads the patch and writes it, with the error checked. The commit patch adds `outcomesRecorded`, `mismatchCount` and `failureReasons`; dry-run counts and `ignoredColumns` survive. Absence of `outcomesRecorded` marks a legacy batch.
- **Report.** `lib/import-reconciliation.ts` (`server-only`, church from the session): `computeImportReconciliation` and `listRecentImportBatches`. It decides mismatches from the snapshot only and never reads `normalized_payload` or `raw_payload` (personal data) except named JSON keys for the source id. Current giving state is re-read from `donations` in chunks of 200.
- **Surfaces.** Page `/app/church-admin/imports/[batchId]` (church admin only; one page for all five import types; 50 rows per page for each list). Route `GET /api/church-admin/imports/[batchId]/report` (church admin only; 403 for other roles, 404 for a malformed or cross-church id, 409 for a legacy or uncommitted batch; the download is audited and fails closed with a 500 if the audit write fails). "Recent imports" on all five import pages, and a "View reconciliation report" link after a commit. `jsonToCsv`, `neutralizeFormulaInjection` and `csvCell` moved to `lib/csv.ts` (`/api/reports/custom` re-exports them). No new server actions.

## Bugs found while building
- **Already on `main`: the Supabase commit replaced `import_batches.summary`,** losing the dry-run counts and `ignoredColumns` (the five importers and `failImportBatch`). The codebase researcher said the summary was already merged; it had read the local-SQL branch, not the Supabase one (a dual-path trap, `arch_supabase_only`). Fixed by the summary merge.
- **Already on `main`: existing-record lookups ignored errors** (`const { data: existing }` in giving, attendance, groups and events), so a refused read looked like "no record yet". Errors are now checked.
- **An importer's own page could crash because of a secondary list:** one failed Recent imports read took down the whole import page (R6). The pages now show "Recent imports could not be loaded".

## Council Review 46 fixes (R1-R10)
- **R1** outcomes could be falsified by a church admin (direct PATCH or set on insert): immutability trigger, with database tests for the admin case.
- **R2** a refused final flush no longer claims `outcomesRecorded`; the batch falls back to the honest "not fully recorded" state.
- **R3** the RPC's row count is checked against the chunk.
- **R4** commits revalidate the import page; dry-run-only batches are left out of Recent imports; in-progress batches read "Not finished".
- **R5** the report's back link goes to its own importer.
- **R6** failed Recent imports read is contained (above).
- **R7** status labels, a red badge for failed, and the inert `aria-live` removed.
- **R8** `finishImportBatch` is guarded on `committing`.
- **R9** a fund added after import shows under "changed since import" (the import verdict is unchanged).
- **R10** numeric CSV cells stay numbers, so a negative `difference_usd` is not exported as text.
- **5 agent claims wrong or unsupported** (see the synthesis). One of them was an agent listing T3 as remaining work, which was folded into R1 on 2026-09-29.

## Verification
Orchestrator-run on `dcc6c14`:
- `npx vitest run`: 221 files, 2,895 tests pass.
- `npx tsc --noEmit`: clean.
- `npm run lint`: 0 errors, 1 warning.
- `npm run test:surfaces`: OK.
- `npm run build`: OK.

Orchestrator-run on `ecbd266`: `npm run lint:migrations` PASS; fresh reset OK; `npm run test:db` 111 pass.

Builder-run, after the fixes: reset OK; `npm run test:db` 116 pass; `import-vendor-fixtures.spec.ts` plus `api-session-routes.spec.ts` 57 passed; `import-vendor-fixtures.spec.ts` alone 14/14 with retries 0 (every fixture reconciles with zero mismatches; negatives show a forced failure as a mismatch and an edited gift under "changed since import").

The local page-role sweep had login-redirect timeouts on unrelated pages: the known local auth flake (`feedback_local_e2e_environment`). CI is the judge.

Timings, local, 5,000 rows: people commit 1.8 s, giving commit 21.6 s (18.4 s before the outcome writes), reconciliation 0.5-0.75 s.

**Not verified:** CI (`verify` and the four `e2e` shards) and GitHub's PR review have not run (no PR yet); hosted timing.

## Residual risk
- **Migration order.** Migration `20261009000000` must be on the hosted database before this merges (owner action O16). A commit running the new code against the old schema fails at its first outcome flush.
- **A batch stuck in `committing`** (a function killed at its time limit) is never released and its report stays "not available". The trigger also blocks outcome writes outside `committing`, so there is no recovery path yet. New Should row S27.
- **A church admin can still edit `import_batches.summary`,** including `mismatchCount`, through the existing update policy. Low. Folded into S27 (move summary writes behind a function).
- `insertProfileChunk` pairs rows with returned ids by position, assuming `INSERT ... RETURNING` keeps input order (Review 45 D4, still open).
- Only the CSV download is audited, not viewing the report on screen and not direct edits.
- Whether a giving `sourceId` in the CSV can carry a donor identifier from a vendor file is UNVERIFIED; the fixtures use gift or transaction ids, and Breeze gifts without an id get content hashes.
- The report re-reads up to 5,000 records on every page view (admin only, about 0.75 s locally).
- Imported gifts still do not post to the general ledger; the report and CSV say so.
- Carried from G4.1: every vendor fixture is a stand-in (O15); giving, attendance, events and groups still commit one row at a time (S26).

## Follow-up
Apply migration `20261009000000` to the hosted database (O16), then open the PR; get `verify` and the four `e2e` shards green; read GitHub's review before merging; resolve threads. After merge, Gap 4 closes. Then M4's remaining rows (G2.1, G2.2). Open rows: S27 (release stuck batches, summary writes behind a function), S24-S26 from G4.1. MVP readiness 91 since G4.1 merged; 92 proposed on this merge.
