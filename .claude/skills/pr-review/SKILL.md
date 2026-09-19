---
name: pr-review
description: Mandatory read-only pre-merge review gate for ChurchCore. Use for every PR, in addition to the Council requirement for non-trivial work.
---

# ChurchCore PR Review

## Chain

1. Read `AGENTS.md`, `DEVELOPMENT_PLAN.md`, relevant ADRs, and the current diff.
2. Invoke the read-only `pr-reviewer` subagent against the full diff.
3. Rank findings Critical, Important, or Minor with file and line references.
4. Route Critical or Important findings back to the author or builder, then rerun this gate after fixes.
5. Record Minor findings in the PR description whether accepted or deferred.

## Rules

- `pr-reviewer` never edits, approves, merges, or closes a PR.
- This gate applies to every PR. It does not replace the Council required for non-trivial work.
- Confirm tests match the changed behavior and risk.
- Confirm `README.md`, `CHANGELOG.md`, and relevant docs changed when needed.
- Report current lint, test, and build evidence; never treat stale results as proof.
