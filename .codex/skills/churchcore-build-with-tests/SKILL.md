---
name: churchcore-build-with-tests
description: Use when implementing or extending ChurchCore Ops features, fixing bugs, or changing behavior in code from Codex.
---

# ChurchCore Build With Tests

Use this Codex-compatible workflow for implementation work in ChurchCore Ops.

## Required Context

Read these before editing:

1. `AGENTS.md`
2. `DEVELOPMENT_PLAN.md`
3. Relevant ADRs in `docs/adr/`
4. Relevant module docs under `docs/`
5. Approved story, technical brief, or roadmap section when available

## Workflow

1. Research first. Use `rg`, `rg --files`, and parallel file reads to inspect similar features.
2. Identify 2-3 existing patterns to reuse.
3. Make a concise plan with `update_plan` for multi-step work.
4. Implement the smallest coherent slice.
5. Add or update focused tests near the changed behavior.
6. Update `README.md`, `CHANGELOG.md`, and relevant docs for meaningful feature changes.
7. Verify with targeted tests, then `npm run lint` and `npm run build` when feasible.

## ChurchCore Rules

- Preserve control-plane versus tenant separation.
- Preserve tenant isolation, RLS, audit trails, consent, child-safety, finance correctness, and role access.
- Do not add dependencies without explicit approval and an ADR for unusual choices.
- Do not refactor unrelated code.
- Do not expose raw provider payloads, secrets, payment details, child-sensitive data, pastoral notes, or database errors.
- Report exact verification commands and failures. Do not claim completion without fresh evidence.
