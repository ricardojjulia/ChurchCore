---
name: churchcore-feature-factory
description: Use when building a non-trivial ChurchCore Ops feature end to end in Codex, especially when product rules, architecture, backend, frontend, tests, docs, and validation are involved.
---

# ChurchCore Feature Factory

This is the Codex-compatible version of the software-factory workflow. It maps Claude subagent roles into Codex work phases.

## Role Chain

Use the role contracts in `references/agent-roles.md`.

1. **Researcher:** map relevant files, existing patterns, risks, tests.
2. **Story writer:** turn the idea into acceptance criteria.
3. **Spec writer:** produce the technical brief.
4. **Backend builder:** implement server/data/provider work.
5. **Frontend builder:** implement routes/components/mobile UI.
6. **Test verifier:** add acceptance and edge-case tests.
7. **Implementation validator:** review diff against story, brief, and repo rules.
8. **PR reviewer:** final review if requested.

## Codex Process

1. Read `AGENTS.md` and `DEVELOPMENT_PLAN.md`.
2. Use `churchcore-build-with-tests` for implementation phases.
3. For broad work, use `update_plan` and keep one active item at a time.
4. Run read-only exploration in parallel where useful.
5. Run write phases sequentially to avoid file conflicts.
6. Ask for human approval before implementing if product rules or technical approach are unresolved.
7. Validate before handoff with targeted tests, `npm run lint`, and `npm run build` when feasible.

## Stop Conditions

- Missing business rule that changes data model, role access, payments, child safety, or tenant boundaries.
- Required provider credentials are unavailable.
- Implementation would require an unusual dependency without ADR/approval.
- Tests or build fail for reasons that cannot be isolated from the change.

## Output

End with:

- files changed
- behavior added or changed
- verification commands and results
- known residual risks or pre-existing failures
