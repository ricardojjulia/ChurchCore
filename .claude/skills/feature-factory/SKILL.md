---
name: feature-factory
description: Use when building a non-trivial ChurchCore Ops feature end to end, especially when product rules, architecture, backend, frontend, tests, and validation are all involved.
---

# Feature Factory

Run structured feature work through focused agents and approval gates.

## Chain

1. Invoke `codebase-researcher` with the feature idea and area of code.
2. Invoke `story-writer` with the feature idea and research findings.
3. Ask the human to approve, revise, or reject the story.
4. Invoke `spec-writer` with the approved story and research findings.
5. Ask the human to approve, revise, or reject the technical brief.
6. Invoke `backend-builder` when backend/server/data work is in scope.
7. Invoke `frontend-builder` when UI/mobile/web work is in scope.
8. Invoke `test-verifier` with the story, brief, and builder summaries.
9. Invoke `implementation-validator` with the story, brief, test report, and diff.
10. If critical findings exist, route back to the relevant builder, then rerun `test-verifier` and `implementation-validator`.
11. Ask the human before PR creation, merge, or launch claims.

## Rules

- Never skip human approval after the story or brief.
- Read-only agents may run in parallel; writing agents must run in sequence.
- Do not let builders widen scope beyond the approved brief.
- If an agent reports a blocker, stop and surface it.
- Keep each feature as one coherent vertical slice; split oversized work at the story level.
- End with verification evidence: targeted tests, `npm run lint`, `npm run build`, and any known residual failures.
