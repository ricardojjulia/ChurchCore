---
name: build-with-tests
description: Use when implementing or extending ChurchCore Ops features, fixing bugs, or changing behavior in code.
---

# Build With Tests

Use this workflow for ChurchCore Ops implementation work.

## Required Context

Read these before editing:

1. `CLAUDE.md`
2. `AGENTS.md`
3. `DEVELOPMENT_PLAN.md`
4. Relevant ADRs in `docs/adr/`
5. Relevant module docs under `docs/`
6. The approved story or technical brief, when available

## Process

1. Map 2-3 similar existing features and reuse their patterns.
2. Keep the change scoped to the approved module and role boundary.
3. Write or update tests near the changed behavior.
4. Preserve tenant isolation, RLS, audit, consent, child-safety, finance, and control-plane/tenant boundaries.
5. Update `README.md`, `CHANGELOG.md`, and relevant docs for meaningful feature changes.
6. Run targeted tests first, then `npm run lint` and `npm run build` before handoff when feasible.

## Rules

- Do not add dependencies without explicit approval and an ADR for unusual choices.
- Do not refactor unrelated code.
- Do not edit migrations after they are merged unless the task explicitly requires a corrective migration.
- Do not expose raw provider payloads, secrets, payment details, child-sensitive data, pastoral notes, or database errors.
- If verification fails, report the exact command and failure; do not claim completion.
