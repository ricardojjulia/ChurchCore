---
name: gemini-council
description: Gemini (Antigravity) entrypoint for the ChurchCore Ops council review defined in improve-software.md — 4-agent audit plus Documenter close-out, integrated with native Planning Mode. Use before any non-trivial merge to main.
---

# ChurchCore Gemini Council

This is the Gemini-specific version of the protocol in `improve-software.md` at the repo root — read it first; it is the source of truth, this skill only integrates its phases with Gemini's native Planning Mode.

Mandate: per `AGENTS.md` and `improve-software.md` §0, the council runs before every non-trivial merge to `main`.

## Process

1. Read `AGENTS.md`, `DEVELOPMENT_PLAN.md`, and `improve-software.md` §0–2.
2. Run the four Phase 1 audit prompts (database/API, routes/pages, UX/shell, feature/competitive) as read-only exploration.
3. Synthesize consensus findings and draft ADRs under `docs/adr/`; write `implementation_plan.md` covering the agreed prompt sequence with `request_feedback = true`, and commit the synthesis plus agent reports under `docs/reviews/`.
4. Wait for explicit human approval on `implementation_plan.md` before executing.
5. Execute via `gemini-build-with-tests`, tracking tasks in `task.md`; write phases run sequentially.
6. Verify: `npm run test`, `npm run lint`, `npm run build` must all pass — record results in `walkthrough.md`. Any failure is a stop condition.
7. **Documenter close-out** (Agent 5, write role, docs/changelog/plan/ADRs/memory only — never application code):
   - Correct `DEVELOPMENT_PLAN.md` status/roadmap/exit-criteria to match what shipped.
   - Add a `CHANGELOG.md [Unreleased]` entry in the repo's existing style.
   - Update `README.md` and affected `/docs` pages.
   - Finalize any ADR left in draft form from step 3.
   - Confirm the `docs/reviews/` output from step 3 is actually committed.
   - Record the close-out itself in `walkthrough.md` so it's part of the reviewable artifact trail.
8. Only after Documenter close-out: ask the human before opening the PR. Reference the council synthesis and Documenter close-out in the PR description.

## Stop Conditions

- Missing business rules affecting data boundaries, RLS policies, role access, payments, or child safety.
- Required provider credentials/keys missing without stubs.
- TypeScript, lint, or build failures that can't be isolated.
- The branch under review carries large accumulated, unreviewed history — flag this in `walkthrough.md` as a finding, don't merge around it.
- A branch that touches pages, API routes, or server actions where `npm run test:surfaces` fails, the CI `e2e` job isn't green, or a new surface has no `tests/coverage-manifest.json` entry and tests. The Documenter withholds sign-off until this is resolved.
