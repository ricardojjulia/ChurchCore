# Council Review 44 — Agent reports (S11 Suppressions page)

This was a diff-scoped round on `feat/suppressions-page-s11` (`ad2219f`), compared with `main`. Five separate read-only agents each received their verbatim `improve-software.md` prompt plus a scope preamble. Their reports are condensed below. The synthesis checks every claim against source and lists the six that were wrong.

## Agent 1 — Data & API

**Verdict:** pass.

**Confirmed:**
- The delete is scoped to the admin's church and to `reason in (bounce, manual)`.
- The deleted row count is checked.
- A Postgres 23505 (duplicate) error is handled.

**Raised:**
- Each removal writes two audit rows, one from the trigger and one explicit. Accepted.
- The 1,000-row cap is silent. Fixed as fix 3.
- There is no retention policy. Deferred.

**Wrong:**
- It claimed `authenticated` has insert access. It has reads only.
- It called the absence of an authenticated delete policy "debt". That absence is by design.

## Agent 2 — Routes & Pages

**Verdict:** pass.

- The page gate matches the history page.
- The Suppressions sub-nav item appears in all five communications clients.
- The manifest entry and tests are in place, and the runbook §3 update is confirmed.

**Wrong:** it called `suppressContactAction` "new". It already existed and this branch changed it.

## Agent 3 — UX & Shell

**Confirmed, and fixed:**
- The table has no horizontal scroll on phones (fix 1).
- Add and remove feedback has no live region (fix 2).

**Minor items, deferred:**
- Pastors and secretaries see no "admins only" hint.
- An empty filtered view gives no hint about the totals.
- The streamed markup briefly duplicates inputs before hydration.

**Wrong:**
- It treated teal and red as ADR 0026 violations.
- It said the Mantine modal lacks labelling, focus restore and autofocus.

## Agent 4 — Feature & Plan

**Verdict:** S11 meets every acceptance criterion. The consent decision is sound (marked UNVERIFIED legally). Readiness 89–90.

**Wrong or unsupported:**
- It mislabelled S20/S21.
- Its slack figure was inconsistent with the plan.
- Its competitor table was unsourced.

## Agent 5 — Security

**Verdict:** approved for merge.

**Confirmed:**
- Authorization holds on both actions and on the loader.
- Every admin-client query is scoped to the church.
- RLS gives `authenticated` reads only.
- The name lookup has two layers of protection against `.or()` filter injection.
- The lock holds, and is re-checked inside the delete filter.
- An ID from another church returns "not found".
- The login id and church profile id are used in the right places.

**Raised:** the error returned when the audit write fails after a delete. It was reworded as fix 4, since the database trigger has already recorded the delete.
