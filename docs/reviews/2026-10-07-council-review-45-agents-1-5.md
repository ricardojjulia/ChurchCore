# Council Review 45: agent reports (G4.1 Planning Center and Breeze importers)

This was a diff-scoped round on `test/import-fixtures-g4-1` (`f1875ee`, `316f6b4`), compared with `main`. Five separate read-only agents each received their verbatim `improve-software.md` prompt plus a scope preamble. Their reports are condensed below. The synthesis checks every claim against source and lists the wrong ones.

## Agent 1: Data and API

The migration is backwards-compatible, states its rollback, and no cross-church `member_number` lookup exists.

**Confirmed builder claims:**
- the body limit, the caps and blank-cell preservation (people)
- batched commit with a per-row retry
- `is_open: false` for tag groups
- events `category`
- content-hash ids, and database-level dedupe indexes

**Findings:**
- D1, Medium: no claim before commit.
- D2, Medium: giving update forces `status` and a blank `is_recurring`.
- D3, Low-Med: parallel updates race, and a swallowed family-insert error.
- D4, Low: RETURNING order assumed.
- D5, Low: non-atomic dry-run batch; the Supabase commit replaces `summary`.
- D6, Medium, UNVERIFIED: commit time and no `maxDuration`.
- D7, Low: synthetic ids can't be updated; positional `EVT-n`/`GRP-n`.
- Fixtures missing: a large file, an edited re-import, a cross-church e2e.

**Verdict:** fix D1 and D2 before merge.

## Agent 2: Routes and pages

No 404s, stubs or orphaned handlers, and the manifest is updated.

**Findings:**
- Medium: four of the five importers have no inbound link.
- Low: the caps are duplicated in six places; `IMPORT_MAX_ROWS` is unused.
- Low: the line-counted row cap.
- Low: the client and server byte measures differ.
- Coverage: no browser test of the upload path.

**Wrong:** it marked the `bodySizeLimit` key UNVERIFIED; the Next docs confirm it.

## Agent 3: UX and shell

**High:** a vendor file on the default `generic_csv` source rejects every row, and the e2e test always picks the source.

**Medium:**
- a stale dry run stays committable after a new file loads;
- Commit stays enabled after success;
- the 50-row preview is silent.

**Low:**
- `aria-label` on a plain div;
- the membership table alone has a label;
- the people table has no scroll wrapper;
- clearing the file input does nothing;
- the row cap counts lines;
- "required columns" copy is wrong for vendor files.

**UNVERIFIED:** textarea lag with 3.5 MB of text.

## Agent 4: Feature and plan

**Coverage:**
- People 70: birthdate, address and status dropped; everyone imported `active`.
- Giving 85: PCO links by email only; no GL posting.
- Attendance 80 for Breeze, 0 for PCO.
- Groups/Tags 80 for Breeze, 0 for PCO.
- Events 85.

**Competitive gaps:** no reconciliation (G4.2), lossy people migration, PCO coverage unverified, bulk history impractical, and carried G2 gaps.

**Readiness:** 90, unchanged.

**Must before merge:** map the membership status; amend the plan row; fix `docs/application-guide.md`.

**Wrong or unsupported:**
- "PCO by email only" is by design.
- "Visitors land in comms audiences" is untraced.
- "DoD not met for PCO" ignores the owner's rescope.

## Agent 5: Security

No Critical or High findings. Authorization passes: every action gates on church admin and takes ids from the session. Tenant isolation passes: the user-scoped client is used with an explicit `church_id`, and no service-role client appears.

**Findings:**
- M1: staging RLS lets lower roles plant payload ids that the commit trusts.
- M2: raw vendor rows kept forever, readable by lower roles, outside erasure.
- L1: the 4 MB body limit applies globally.
- L2: no audit entry for a bulk commit.
- L3: unchecked zero-row updates.
- L4: commit TOCTOU.
- L5: a tag can join an existing open group.
- Events crash when given an unknown source system.

**Incomplete:** M1 names ministry leaders; pastors are admitted too.
