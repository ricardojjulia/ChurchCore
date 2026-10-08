# ADR 0029: Import row outcomes: column-limited grant, INVOKER bulk function and immutability trigger

- Status: Accepted
- Date: 2026-10-08
- Deciders: Ricardo Julia
- Related: ADR 0022 (admin-client writes), ADR 0024 (actor from `auth.uid()`), ADR 0028 (layered isolation); G4.2, Council Review 46

## Context

G4.2's reconciliation report needs, for every staged import row, what the commit did with it: written (with the record id) or failed (with a safe reason), plus a snapshot of the key values (for gifts: amount, date, fund) so a later edit can be told apart from an import mistake. The outcomes live on `import_batch_rows`, next to the staged payload.

Constraints:

- The staged payload and its classification hold personal data and are the evidence of what was uploaded. They must stay immutable once staged.
- A commit writes up to 5,000 outcomes. One request per row is too slow; bulk writing is needed.
- Writes the app makes through the church-admin session are checked by RLS. Using the admin client for this would bypass the policies (ADR 0022 allows that only after code-side checks) and the report is evidence for the church admin, so the evidence must not be forgeable by that same admin.
- Since G4.1 (migration `20261008010000`), only church admins can touch the import tables.

Council Review 46 (R1) found that a first version, with the "outcome is still null" guard living only inside the bulk function, let a church admin PATCH the outcome columns directly after a commit, or set them on insert, and so hide a giving mismatch.

## Decision

Three layers, in one migration (`20261009000000`):

1. **Column-limited update.** Add a church-admin `UPDATE` policy on `import_batch_rows`, revoke table-wide `UPDATE` from `authenticated`, and grant `UPDATE` on the four outcome columns only (`commit_outcome`, `committed_record_id`, `commit_failure_reason`, `commit_snapshot`). Payload and classification cannot be updated through the API by anyone but the service role.
2. **A `SECURITY INVOKER` bulk function.** `record_import_row_outcomes(p_batch_id uuid, p_outcomes jsonb)` runs one `UPDATE ... FROM jsonb_to_recordset(...)` for a chunk of 500, restricted to the given batch and to rows whose outcome is still null, and returns the row count (the caller throws on a mismatch). It is `INVOKER`, so RLS and the column grant apply to the caller: it needs no privilege of its own and cannot be used to reach another church's rows. It takes no actor argument; `EXECUTE` is revoked from `public` and `anon` and granted to `authenticated`.
3. **An immutability trigger.** `import_batch_rows_commit_outcome_guard` (`BEFORE INSERT OR UPDATE`, `SECURITY INVOKER`, for every role with no bypass) raises `42501` unless the parent batch is `committing`, and raises when an already-set outcome would change. The rule holds on insert as well as update, and holds for church admins and the service role alike. The function's own null-guard remains as a second check.

## Consequences

- **The report is evidence.** After a commit finishes, no one, including a church admin or the service role, can rewrite a row outcome through the API. `tests/database/import-staging-rls.test.ts` proves the column limit, the denied roles, the cross-church case and the trigger (outside `committing`, once set, on insert, admin included).
- **Cost and speed.** 5,000 outcomes are written in 10 calls. The giving commit at 5,000 rows went from 18.4 to 21.6 s locally; people commit stays 1.8 s.
- **No recovery path yet.** Because outcomes can only be written while the batch is `committing`, a batch stuck in `committing` (a function killed at its time limit) cannot be released or finished from the app. A release or recovery function is tracked as plan row S27.
- **`import_batches.summary` is not covered.** A church admin can still edit it through the existing update policy, including `summary.mismatchCount`, which "Recent imports" reads. Low risk (the report itself is computed from the rows); moving summary writes behind a function is part of S27.
- **Pattern for later.** A table that holds both immutable evidence and mutable result columns gets a column-limited grant, a bulk `INVOKER` function and a trigger that enforces the state machine, rather than a `SECURITY DEFINER` function or the admin client. The migration is backwards-compatible (nullable columns, new policy, grant, function and trigger; no existing writer updates `import_batch_rows` outside a commit). Rollback is in the migration header, including the trigger.
- **Deploy order.** Apply the migration to the hosted database before the code merges: new code against the old schema fails at its first outcome flush (owner action O16).
