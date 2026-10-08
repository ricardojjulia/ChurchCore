# Council Review 45: synthesis (G4.1 Planning Center and Breeze importers)

**Status: AMENDED.** This is the Council's recommendation; the owner decides. Merge after the required fixes below land and verify clean.

| | |
| :--- | :--- |
| Date | 2026-10-07 |
| Branch | `test/import-fixtures-g4-1` (`f1875ee` backend, `316f6b4` frontend) vs `main` `95a8483` |
| Related | DEVELOPMENT_PLAN.md §0 G4.1 (rescoped by the owner 2026-10-07 from "fixtures only", 1 day, to "make it work", about 3 days); factory notes `docs/factory-runs/2026-10-07-g4-1-vendor-importers.md` |
| Tags | import, migration, tenancy, RLS, giving, people |
| Surfaces | `/app/church-admin/{people,giving,attendance,groups,events}/import` pages and their 10 server actions; migration `20261008000000`; `next.config.ts` |

Diff-scoped round. Five separate read-only agents each received their verbatim `improve-software.md` prompt plus a scope preamble; reports are condensed in `2026-10-07-council-review-45-agents-1-5.md`. The orchestrator checked every claim used below against source.

## What the branch does

The five importers now read Planning Center and Breeze files:

- **Header matching:** headers match regardless of case, spacing or punctuation.
- **Dates:** US and ISO dates are read in the church's timezone.
- **Person linking:** people are linked by the vendor's person ID first, then by email.
- **Gift IDs:** a gift with no ID gets a stable content-hash ID, so re-imports are idempotent.
- **Breeze Tags:** these import as group memberships.
- **Limits:** the row cap rises from 100 to 5,000, with a 4 MB server-action body limit and a 3.5 MB check on each import action.
- **Blank cells:** a blank cell no longer overwrites a stored value.
- **People commit:** batched, from 188 s down to 1.9 s for 5,000 rows on local Supabase.
- **Fixtures:** in `tests/fixtures/imports/`, labelled by confidence (VERIFIED template, PARTIAL third-party corroborated, UNVERIFIED). Neither vendor publishes its export header row.
- **Migration:** drops the global `profiles_member_number_uidx`, which made one church's member number block another's and revealed that it existed.

Two bugs that were already on `main` were found and fixed while building:
- Every events-import commit failed, because `events.category` is NOT NULL and was never set.
- Unmatched attendance rows were classified "create" and then failed at commit, because `attendance.profile_id` is NOT NULL.

## Consensus and required fixes

| # | Finding | Seats | Verified | Fix |
| :--- | :--- | :--- | :--- | :--- |
| R1 | Pastors and ministry leaders can insert and update import staging rows and batches, because the policies use `can_manage_church` (church admin, pastor and ministry leader; `20260529011500:20-53`). A lower role can plant a row in an admin's pending batch carrying any `profileId`, `eventId`, `ministryId` or `leaderProfileId`. When the admin commits it, the result is a misattributed gift or attendance record, or a group leader picked by a lower role. Only the new Tags path re-checks ids. Pre-existing; the branch makes imports routine. | A5 | Yes | Migration: `import_batches` and `import_batch_rows` select, insert and update for church admins only (pattern from `20261003000000:32`). At commit, re-check every payload id against this church's profiles, events and ministries. |
| R2 | No claim before commit. Two concurrent commits (double-click, second tab) each build their own index, and rows matched by email or name+phone duplicate profiles. Pre-existing; the window is now wider. | A1, A5 | Yes (`lib/people-import-dry-run.ts:876` vs `:968`) | Claim the batch (`dry_run_completed` → `committing`, conditional, row count checked; the status CHECK widened in the same migration), and set it to `failed` on error. |
| R3 | A Planning Center or Breeze People file on the default source rejects every row. The page defaults to `generic_csv` and always sends a `full_name` mapping (`church-admin-people-import-workspace.tsx:46,71`). The e2e test always picks the source explicitly, so it never caught this. | A3 | Yes | Detect the vendor from the headers on upload or paste on all five pages; per-source "required columns" copy; warn when mapped columns are missing; an e2e step that uploads without choosing a source. |
| R4 | A stale dry run stays committable after a new file loads, and Commit stays enabled after a successful commit. | A3 | Yes | Clear the results whenever the CSV text changes; disable Commit after success. |
| R5 | Nothing links to the giving, groups, attendance or events importers; they are reachable only by typing the URL. | A2 | Yes (repo grep) | An "Import" button on each parent page, matching people (`church-admin-people-workspace.tsx:349`). |
| R6 | Everyone imported is created as `active`, so a Planning Center visitor or inactive person becomes an active member. Pre-existing (`main` `:633`). | A4 | Yes | On create only: PCO `Status` "Inactive" → `inactive`; `Membership` containing "visitor" → `visitor`; otherwise `active`. Never change an existing person's status. |
| R7 | A giving update forces `status: "succeeded"` and writes `is_recurring` even when blank, which undoes a refund or failure status and the recurring flag. | A1 | Yes (`lib/giving-import-dry-run.ts:577-578`) | Do not set `status` on update; set `is_recurring` only when the cell is present. |
| R8 | People updates run 10 at a time. Two file rows resolving to the same profile race, with the last writer winning. A failed bulk family insert is swallowed (`:769`), and the per-row fallbacks can then create duplicate households in parallel. | A1 | Yes | Serialize rows that target the same profile; create missing families serially before the updates; log the swallowed error. |
| R9 | Giving, attendance, events and groups still commit one row at a time, and no import page sets `maxDuration`. | A1, A4 | Yes; hosted timing UNVERIFIED (giving 12 s locally) | `export const maxDuration = 300` on the five import pages (Next: page-level `maxDuration` sets the timeout for that page's server actions). |
| R10 | Profile, donation and attendance updates count a refused or zero-row update as success. | A5 | Yes | `.select("id")` with a row-count check (the T1a pattern). |
| R11 | `raw_payload` stores the whole vendor row, ignored columns included. | A5 | Yes | Store consumed columns only. |
| R12 | No `audit_log` entry for a bulk commit. | A5 | Yes | One `logAuditEvent` per commit, with the batch id and counts. |
| R13 | Small items: `EVENT_SOURCE_ALIASES[sourceSystem]` has no fallback (`lib/events-import-dry-run.ts:229`; an unknown source throws); `IgnoredColumns` puts `aria-label` on a plain div; the people table has no scroll wrapper; the 50-row preview is silent; clearing the file input does nothing; a tag joining an existing group isn't stated in the dry run. | A3, A5 | Yes | Fix each. |

## Recorded, not fixed

These are new tracker rows or follow-ups.

- **Raw-payload retention and erasure:** `erase_profile_pii` does not scrub `import_batch_rows`, and staged rows are never purged. New Should row.
- **Fields people import doesn't bring over:** birthdate, address and gender. New Should row.
- **Imported gifts don't post to the GL:** the posting function is RPC-only. G4.2's report should state this.
- **Body limit:** the 4 MB server-action body limit applies to every action, including public ones. Accepted; public actions validate their own field lengths.
- **Unverified Planning Center exports:** Check-Ins, Groups and Calendar headers are unverified, so there are no fixtures. A pilot export is needed (Agent 4).
- **Ids without a source column:** events and groups whose file has no id column still get positional `EVT-n`/`GRP-n` ids. Pre-existing.
- **A corrected re-export:** it creates a second gift where the gift's id is synthetic. By design.
- **Physical-line row cap:** the cap counts physical lines, so a quoted multi-line cell counts as extra lines. Safe side.
- **Row mapping by index:** `INSERT … RETURNING` order is assumed when mapping ids back to rows (D4).
- **Dry-run batches aren't atomic:** a failed chunk leaves an orphan batch (D5).
- **The column-reference ratchet:** raised from 45 to 47, because conditional-spread updates are invisible to the scan.

## Claims that were wrong or unsupported

1. **A4** listed "PCO gifts link by email only" as a gap. It is by design: Planning Center publishes no donor person-id column. Its donation-history "Donor number" is not a person id (vendor research).
2. **A4** said visitors imported as active "land in directories and comms audiences". This was not traced in code. Plausible, unverified.
3. **A2** marked the `experimental.serverActions.bodySizeLimit` key UNVERIFIED. The bundled Next docs (`serverActions.md`) confirm it.
4. **A5** named ministry leaders as the lower role in R1. True, but incomplete: `can_manage_church` also admits pastors, who are equally unable to import.
5. **A1** said D1 and D2 need no migration. D1's `committing` status needs the status CHECK widened, so it rides in this branch's migration.
6. **A4** recommended no score change and said G4.1's definition of done "isn't met for PCO". The owner's rescope (2026-10-07) made unverified Planning Center formats best-effort. The plan row is amended to match rather than counted as a miss.

## Definition of done (evidence only)

- [ ] R1–R13 fixed, each with a test.
- [ ] `npx vitest run`, `npx tsc --noEmit`, `npm run lint`, `npm run test:surfaces`, `npm run build` clean.
- [ ] Migration: `npm run lint:migrations` passes; applies to a fresh reset; backwards-compatible (policy tightening plus a widened CHECK; the old code's writes all come from church admins); rollback stated.
- [ ] `npm run test:db` and `tests/e2e/import-vendor-fixtures.spec.ts`, including the upload-without-choosing-a-source step.
- [ ] CI `verify` and the 4 `e2e` shards green; GitHub's PR review read and resolved.
- [ ] Documenter: plan row G4.1 amended and closed; new Should rows; CHANGELOG; `docs/application-guide.md` import sections; memory.

## Readiness

90/100 holds until merge. 91 is proposed on merge with R1–R13 fixed. Gap 4 still needs G4.2.
