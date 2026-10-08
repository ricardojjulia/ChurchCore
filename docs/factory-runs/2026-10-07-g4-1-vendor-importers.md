# Factory run: G4.1 — Planning Center and Breeze importers with fixtures in CI (2026-10-07)

**Plan row:** `DEVELOPMENT_PLAN.md` §0 G4.1 (Must, now 3 days, M4). **Branch:** `test/import-fixtures-g4-1`, commits `f1875ee` (backend), `316f6b4` (frontend), `1dce31c` (Council backend fixes), `dbbdedf` (Council frontend fixes), on top of `main` `95a8483`. **Council:** Review 45, AMENDED, R1-R13 fixed ([synthesis](../reviews/2026-10-07-council-review-45-synthesis.md), [agent reports](../reviews/2026-10-07-council-review-45-agents-1-5.md)).

## Intent
The row began as "fixtures that match Planning Center's and Breeze's published export formats, with each adapter tested against them in CI", 1 day. Research on 2026-10-07 showed the premise was wrong in two ways. Neither vendor publishes its export header row. And the five importers could not read a real file at all: every adapter matched exact snake_case keys (`full_name`, `donated_at`), dates had to be ISO, and the cap was 100 rows. Fixture tests written from our own assumptions would have passed while a real church's export failed. The owner rescoped the row on 2026-10-07 to "make it work", about 3 days (1 to 3 in the tracker, 2 days of slack consumed).

## Vendor research outcome
Confidence labels are on every fixture (`tests/fixtures/imports/README.md`):
- **VERIFIED template:** Breeze people, giving (Generic), attendance and tags import templates (support.breezechms.com).
- **PARTIAL (third-party corroborated):** Planning Center People export header, as read by ChurchApps B1Transfer and an OCM migration script. The vendor does not document it.
- **UNVERIFIED:** Planning Center giving (only the donation-history *import* fields are documented; export columns are user-selectable), Check-Ins, Groups and Calendar (no documented headers), Breeze events (API only). Planning Center Check-Ins, Groups and Calendar are best-effort with no fixtures.
- Breeze exports are Excel, so the documented workflow is export, open in Excel, save as CSV. `.xlsx` is out of scope.

## Owner decisions (2026-10-07)
- Build as one slice (about 3 days).
- Drop the global `profiles_member_number_uidx`; keep the per-church `profiles_member_number_church_uidx`.
- Name is First + Last (Planning Center: Given Name if First is blank; nickname ignored).
- Breeze tags become groups in category `general` (match an existing group by name, case-insensitive; folder kept in the description).
- Per-batch cap 5,000 rows (was 100).
- Defaults the owner did not object to: refunds and zero or negative amounts stay rejected; a multi-email Breeze cell keeps the first address.
- Out of scope: xlsx, households from Family/Household ID, G4.2 reconciliation, G4.3 flow, refunds, creating events from attendance, API sync.

## Architecture impact
- **Shared normalizer** [`lib/import-normalize.ts`](../../lib/import-normalize.ts): tolerant header keys, `parseImportDate` (US and ISO, church time zone), `contentSourceId` (hash plus occurrence counter), `splitFirstEmail`, a BOM- and blank-row-safe CSV parser. Replaces five duplicated `pickFirst` copies.
- **Profile link index** [`lib/import-profile-index.ts`](../../lib/import-profile-index.ts): church-scoped, paginated (the old loaders stopped at 1,000 rows), Supabase-only. Links by vendor ID (`member_number`) then email.
- **Source detection** [`lib/import-source-detect.ts`](../../lib/import-source-detect.ts): picks the vendor from headers on upload or paste.
- **Commit claim** [`lib/import-commit.ts`](../../lib/import-commit.ts): `dry_run_completed` to `committing` (conditional, row count checked), `failed` on error; re-checks every staged profile, event, ministry and leader id against the church; one `audit_log` entry per commit.
- **Migration `20261008000000`:** drops the platform-wide unique `profiles.member_number` index, so two churches can import exports whose ids collide.
- **Migration `20261008010000`:** `import_batches` and `import_batch_rows` select, insert and update limited to church admins (platform admins as before), no delete policy; status check widened with `committing`. Rollback in the header; it fails while any batch is `committing`. This tightens the policies from `20260529011500` and contradicts no ADR (no ADR mentions the import tables).
- No new routes or server actions; the 10 existing actions keep their gates. `next.config.ts` sets a 4 MB server-action body limit (applies to every action; public ones validate their own field lengths).

## Bugs found while building (already on `main`)
- Every events-import commit failed: `events.category` is NOT NULL and was never set.
- Unmatched attendance rows were classified `create` and failed at commit (`attendance.profile_id` NOT NULL); now skipped with a reason.
- A blank cell on a re-import wiped stored values across all five importers.
- Next's 1 MB body limit would have rejected 5,000-row files.
- The people commit took 188 s for 5,000 rows (one query per row); batched in chunks of 500 it takes 1.9 s locally.

## Council Review 45 fixes
R1 staging church-admin-only (migration) plus id re-checks; R2 commit claim; R3 vendor detection and per-source copy, with an upload-without-choosing-a-source e2e step; R4 stale results cleared, Commit disabled after success; R5 Import buttons on the giving, groups, attendance and events pages; R6 Planning Center inactive/visitor status on create; R7 giving updates keep status and blank `is_recurring`; R8 same-person updates in order, households created serially, swallowed error logged; R9 `maxDuration = 300`; R10 zero-row updates fail the row; R11 `raw_payload` mapped columns only; R12 one audit entry per commit; R13 small items (unknown source system, ignored-columns accessibility, table scroll, "N of M rows", clearing the file clears the text). Six agent claims were wrong or unsupported (synthesis, final section).

## Verification
Orchestrator-run on `dbbdedf`:
- `npx vitest run`: 216 files, 2,798 tests pass.
- `npx tsc --noEmit`: clean.
- `npm run lint`: 0 errors, 1 pre-existing warning.
- `npm run test:surfaces`: OK.

Builder-run:
- `npm run lint:migrations`: PASS.
- `npm run setup:e2e -- --reset`: applies all 111 migrations.
- `npm run test:db`: 103 pass.
- `tests/e2e/import-vendor-fixtures.spec.ts`: 12/12.
- `npm run build`: succeeds.

Local page-role sweep: one full run passed 717/717. Later runs had 11 failures on secretary and ministry-leader pages (communications, elders, giving) that the diff does not touch: the known local auth flake (`feedback_local_e2e_environment`). CI is the judge.

**Not verified:** CI (`verify` and the four `e2e` shards) and GitHub's PR review have not run (no PR yet); hosted commit timing; real vendor export files.

## Residual risk
- Every fixture is a stand-in; a real export may differ (O15). Planning Center Check-Ins, Groups and Calendar are unverified.
- Giving, attendance, events and groups still commit one row at a time (giving 12 s locally for 5,000 rows; hosted unmeasured). S26.
- `import_batch_rows.raw_payload` (mapped columns) is not scrubbed by `erase_profile_pii` and never purged. S24.
- People import ignores birthdate, address and gender. S25.
- Imported gifts do not post to the GL (RPC-only posting function); G4.2's report must say so.
- Smaller, from the synthesis: events and groups without an id column get positional `EVT-n`/`GRP-n` ids; a corrected re-export of a gift with a synthetic id creates a second gift; the cap counts physical lines; ids are mapped back to rows by `INSERT ... RETURNING` order; a failed dry-run chunk can leave an orphan batch; the column-reference ratchet rose from 45 to 47.

## Follow-up
Open the PR; get `verify` and the `e2e` shards green; read GitHub's review before merging; resolve threads. O14: apply migrations `20261008000000` and `20261008010000` to the hosted database after merge. O15: a pilot church's real exports. Then G4.2 (state that imported gifts are not in the GL), S24-S26. MVP readiness 90, 91 proposed on merge.
