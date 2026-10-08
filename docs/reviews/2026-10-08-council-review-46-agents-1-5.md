# Council Review 46: agent reports (G4.2 post-import reconciliation)

This was a diff-scoped round on `feat/import-reconciliation-g4-2` (`8feb3c3`, `ecbd266`), compared with `main`. Five separate read-only agents each received their verbatim `improve-software.md` prompt plus a scope preamble. Their reports are condensed below. The synthesis checks every claim against source and lists the wrong ones.

## Agent 1: Data and API

The migration is backwards-compatible and states its rollback. The policy, grant and RPC are verified. No existing writer updates `import_batch_rows`.

**Findings:**
- Medium: a failed flush still marks outcomes recorded.
- Medium: the RPC row count is unchecked.
- Low: a fund added after import is missed.
- Low: ids are paired with rows by insert position.
- Low: no recovery for a batch stuck in `committing`.
- Low: `finishImportBatch` has no status guard.
- Deploy hazard: the migration must be applied before the code.

**Wrong:**
- It doubted the URL limit, but the 5,000-row run shows it holds.
- It said "people may duplicate".

## Agent 2: Routes and pages

No 404s, stubs or orphaned handlers. The new page and route are in the manifest. The route returns 403, 404 and 409 correctly and fails closed on an audit failure.

**Low:**
- Recent imports goes stale after a commit.
- "Back" goes to the admin home.
- A recent-imports read failure takes down the import page.

## Agent 3: UX and shell

ARIA is mostly correct. Empty states are present and the layout is responsive with theme colours.

**Medium:** a recent-imports failure takes down the whole import page.

**Pain points:**
- A stale list that also shows dry runs, which are dead ends.
- No way back to the importer.
- Raw status text, and a gray badge for "failed".

**Low:**
- An inert `aria-live`.
- CSV errors arrive as files.

## Agent 4: Feature and plan

18 of the 20 acceptance criteria are met, one is met with a defect (the flush flag), and one depends on CI.

**Should:**
- Dry-run copy in Recent imports.
- Access-matrix rows.
- Plan status lines.

**Readiness:** 92 on merge.

**Wrong:**
- It said "T3" remains.
- Teacher: the prompt's role list is stale.

## Agent 5: Security

No Critical or High findings. Authorization, tenant isolation, the INVOKER RPC and grants, PII-free CSV, formula neutralizing and fail-closed audit all pass.

**Findings:**
- M1: outcomes can be falsified by direct PATCH or insert.
- M2: a failed flush still marks outcomes recorded.
- L1: a negative difference exports as text.
- L2: report cost.
- L3: on-screen views are not audited.

**Wrong:** "could duplicate gifts". Giving dedupes on `source_id`.
