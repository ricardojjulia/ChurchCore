# Council Review 46: synthesis (G4.2 post-import reconciliation)

**Status: AMENDED.** This is the Council's recommendation; the owner decides. Merge once the required fixes below land and verify clean, **and once migration `20261009000000` has been applied to the hosted database first**: a commit running the new code against the old schema fails at its first outcome flush.

| | |
| :--- | :--- |
| Date | 2026-10-08 |
| Branch | `feat/import-reconciliation-g4-2` (`8feb3c3` backend, `ecbd266` frontend), compared with `main` `b8b953e` |
| Related | DEVELOPMENT_PLAN.md §0 G4.2 (closes Gap 4 with G4.1); Council Review 45 |
| Tags | import, reconciliation, migration, RLS, giving, CSV |
| Surfaces | new page `/app/church-admin/imports/[batchId]`; new route `GET /api/church-admin/imports/[batchId]/report`; the five import pages (Recent imports); migration `20261009000000` |

Diff-scoped round. Five separate read-only agents each received their verbatim `improve-software.md` prompt plus a scope preamble; reports are condensed in `2026-10-08-council-review-46-agents-1-5.md`. The orchestrator checked every claim used below against the source.

## What the branch does

- **Per-row commit outcomes.** Each commit records, for every row: written or failed, the id of the record written, a safe failure reason, and for gifts a snapshot of the source and stored amount, date and fund. The outcomes go to `import_batch_rows` through a SECURITY INVOKER bulk function in chunks of 500.
- **Column-limited admin write.** A church-admin update policy plus a column grant lets admins write only the four outcome columns. The staged payload and its classification stay immutable.
- **The summary is merged, not replaced.** It used to be replaced, which lost the dry-run counts and ignored columns.
- **The report** (`lib/import-reconciliation.ts`, server-only) shows:
  - counts per import;
  - giving totals: source, written at commit, current, and the difference;
  - the general-ledger note;
  - mismatches: failed rows, rows never attempted, and stored values that differ from the source at commit;
  - a separate "changed since import" list (edited, deleted, merged) that does not count against the import;
  - skipped and rejected rows, with reasons.
- **The report page** opens after a commit and from "Recent imports" on every import page.
- **The CSV download** has minimal columns, neutralizes formula characters, and is audited; it fails closed if the audit write fails.
- **The journey** checks every fixture for zero mismatches, plus negative cases.

Measured locally: reconciling 5,000 rows takes 0.5–0.75 s. The giving commit at 5,000 rows went from 18.4 to 21.6 s.

## Consensus and required fixes

| # | Finding | Seats | Verified | Fix |
| :--- | :--- | :--- | :--- | :--- |
| R1 | Outcomes can be falsified. The `commit_outcome is null` guard lives only inside the RPC. A church admin can PATCH outcome columns directly after a commit, or set them on insert, to hide a giving mismatch. The orchestrator raised this before the seats reported. | A5, orchestrator | Yes (`20261009000000:30-54`; insert policy from `20261008010000`) | A trigger on `import_batch_rows`: outcome columns may be set only while the batch is `committing`, and only once (an outcome that is already set cannot change). It applies on insert and update, for every role. The e2e seeding follows the same states. |
| R2 | A failed final flush still sets `outcomesRecorded: true`, so written rows show as "not attempted" mismatches (`lib/import-commit.ts:347-349`). The same applies if `finishImportBatch`'s flush is refused. | A1, A4, A5 | Yes | Set `outcomesRecorded` to the flush result. A batch whose outcomes are incomplete falls back to the honest "not recorded" state. |
| R3 | The RPC's returned row count is never checked (`lib/import-commit.ts:138-145`). | A1 | Yes | Throw when the count differs from the chunk length. |
| R4 | Recent imports goes stale after a commit (no `revalidatePath` in any import action). It also lists dry-run-only batches as "mismatches not recorded", and opening one is a dead end. | A2, A3, A4 | Yes (grep) | `revalidatePath` of the import page after commit. Leave dry-run-only batches out of the list. Label in-progress batches "Not finished". |
| R5 | The report's back link goes to the admin home, not the importer the user came from. | A2, A3 | Yes (`church-admin-import-report.tsx:268,282`) | Back link chosen by `import_type`. |
| R6 | One failed read of the recent-imports list takes down the whole import page (`lib/import-reconciliation.ts:435`, awaited by all five pages). | A2, A3 | Yes | The pages catch it and show an inline "Recent imports could not be loaded" message. |
| R7 | Status is shown as a raw value ("dry_run_completed"); "failed" uses a gray badge; an `aria-live` region wraps static server-rendered content. | A3 | Yes | Status labels, a red badge for failed, and remove the inert `aria-live`. |
| R8 | `finishImportBatch` has no `status = committing` guard, unlike the fail path. | A1 | Yes | Add the guard (defence in depth). |
| R9 | A fund added after import is never reported as changed: a null value at commit skips the comparison. | A1 | Yes (`lib/import-commit.ts:93`) | Compare null to a value in "changed since import" only. The import verdict is unchanged. |
| R10 | A negative `difference_usd` exports as text, because the neutralizer prefixes the leading `-`. | A5 | Yes (`lib/csv.ts:6`) | Write numeric cells as numbers; only strings are neutralized. |

## Recorded, not fixed

- **A batch stuck in `committing`** (for example a function killed at its time limit) is never released, and its report stays "not available". New Should row.
- **A church admin can still edit `import_batches.summary`** (including `mismatchCount`) through the existing update policy. Low. Folded into the same Should row, which also covers moving summary writes behind a function.
- **Insert order:** `insertProfileChunk` pairs rows with returned ids by position, assuming `INSERT … RETURNING` keeps input order (Review 45 D4, still open).
- **Not audited:** viewing the report on screen and direct edits. Only the download is audited, which is what the story requires.
- **Giving `sourceId` in the CSV:** whether it can carry a donor identifier from a vendor file is UNVERIFIED. The fixtures use gift or transaction ids, and Breeze gifts without an id get content hashes.
- **Report cost:** every page view re-reads up to 5,000 records. It is admin-only and took about 0.75 s measured.

## Claims that were wrong or unsupported

1. **A4** listed "T3" as remaining work. T3 was folded into R1 on 2026-09-29. A4 also left out the real remaining Must rows, T1b, T2, R1 and R2.
2. **A1** marked as UNVERIFIED whether 200-id `.in()` re-reads stay under PostgREST's URL limit at 5,000 rows. The builder's 5,000-row run re-read all 5,000 donations without error.
3. **A1** said a re-import after a falsely "not attempted" row means "people may duplicate". People re-imports match by member number, then email (G4.1), so an earlier written row is matched and updated, not duplicated, unless it has neither.
4. **A5** said re-importing such rows "could duplicate gifts (UNVERIFIED)". Giving re-imports dedupe on `source_id`: explicit ids update, and content-hash ids are skipped as "Already imported" (G4.1).
5. **A4** marked "Teacher" as not applicable. True, but the prompt's role list is stale. That is a prompt fix (improve-software.md), not a product finding.

## Definition of done (evidence only)

- [ ] R1–R10 fixed, each with a test (R1: a database test showing that an outcome can't be set outside `committing` and can't be changed once set, for an admin as well).
- [ ] `npx vitest run`, `npx tsc --noEmit`, `npm run lint`, `npm run test:surfaces`, `npm run build` clean.
- [ ] Migration: `npm run lint:migrations`; a fresh reset; backwards-compatible (nullable columns, a new policy and grant, a new function, a new trigger; no existing writer updates `import_batch_rows`); rollback stated, including the trigger.
- [ ] `npm run test:db`; `tests/e2e/import-vendor-fixtures.spec.ts`, where every fixture shows zero mismatches.
- [ ] Hosted migration applied **before** merge (owner action), then CI `verify` and the four `e2e` shards green.
- [ ] Documenter: G4.2 row done, Gap 4 closed, the plan's G4.1 merged status, O14 done, the security role-access matrix rows for the new page and route, CHANGELOG, memory.

## Readiness

91 on G4.1's merge. **92 is proposed on G4.2's merge with R1–R10 fixed**: it closes Gap 4, making 4 of 5 gaps closed.
