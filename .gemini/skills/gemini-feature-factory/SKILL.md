---
name: gemini-feature-factory
description: Use when building a non-trivial ChurchCore Ops feature end to end in Gemini (Antigravity), leveraging the native Planning Mode (implementation_plan.md, task.md, walkthrough.md) and toolsets.
---

# ChurchCore Gemini Feature Factory

This is the Gemini (Antigravity) specific version of the software-factory workflow. It integrates the factory phases with Gemini's native Planning Mode and developer capabilities.

## Role Chain

Use the role contracts in `references/agent-roles.md` to guide your reasoning as you transition through phases:

1. **Researcher:** Map relevant files, existing patterns, risks, and tests.
2. **Story writer:** Define the user story and acceptance criteria.
3. **Spec writer (Planning Mode - Plan):** Produce the technical brief and write/update the `implementation_plan.md` artifact with `request_feedback = true`.
4. **Backend builder (Planning Mode - Execute):** Implement database migrations, server logic, and services, tracking tasks in `task.md`.
5. **Frontend builder (Planning Mode - Execute):** Implement UI routes, components, and pages, tracking tasks in `task.md`.
6. **Test verifier:** Add unit, integration, and E2E tests, verifying that the implementation meets acceptance criteria.
7. **Implementation validator:** Run code sanity verification (`npm run lint`, `npm run build`), ensuring zero regressions.
8. **PR reviewer (Planning Mode - Verify):** Review the final diff and summarize findings, open questions, and verification results in `walkthrough.md`.

## Gemini Native Process

1. **Orientation:** Read `AGENTS.md` and `DEVELOPMENT_PLAN.md` before proposing or making changes.
2. **Sequential Execution:** Run write actions sequentially to avoid file and lock conflicts.
3. **Human Approval:** Always wait for the user's explicit approval on the `implementation_plan.md` before starting code implementation.
4. **Verification:** Validate code with targeted tests, `npm run lint`, and `npm run build` before final delivery.

## Stop Conditions

- Missing business rules affecting data boundaries, RLS policies, role access controls, payments, or child safety.
- Required provider credentials/keys (Stripe, Twilio, SendGrid) are missing without stubs.
- Implementation would require adding unusual dependencies without an approved ADR.
- TypeScript, lint, or build compilation fails for reasons that cannot be isolated.

## Output

Conclude by documenting changes in `walkthrough.md` and outlining:
- Files changed and lines affected.
- Added or modified behaviors.
- Verification commands run and test logs.
- Known residual risks, deferred findings, or pre-existing build failures.
