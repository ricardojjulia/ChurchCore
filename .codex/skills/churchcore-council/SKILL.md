---
name: churchcore-council
description: Codex entrypoint for the ChurchCore Ops council review defined in improve-software.md — 4-agent audit plus Documenter close-out. Use before any non-trivial merge to main.
---

# ChurchCore Council (Codex)

This is the Codex-compatible version of the protocol in `improve-software.md` at the repo root — read it first; it is the source of truth, this skill only maps its phases onto Codex work.

Mandate: per `AGENTS.md` and `improve-software.md` §0, the council runs before every non-trivial merge to `main`.

## Process

1. Read `AGENTS.md`, `DEVELOPMENT_PLAN.md`, and `improve-software.md` §0–2.
2. Run the four Phase 1 audit prompts (database/API, routes/pages, UX/shell, feature/competitive) as read-only exploration passes. These can run in parallel.
3. Synthesize consensus findings, draft ADRs under `docs/adr/`, and write the synthesis plus agent reports under `docs/reviews/`.
4. Get explicit human approval on the synthesis before implementing.
5. Execute approved prompts via `churchcore-build-with-tests`, using `update_plan` for multi-step work; write phases run sequentially.
6. Verify: `npm run test`, `npm run lint`, `npm run build` must all pass. Treat any failure as a stop condition.
7. **Documenter close-out** (Agent 5, write role, docs/changelog/plan/ADRs/memory only — never application code):
   - Correct `DEVELOPMENT_PLAN.md` status/roadmap/exit-criteria to match what shipped.
   - Add a `CHANGELOG.md [Unreleased]` entry in the repo's existing style.
   - Update `README.md` and affected `/docs` pages.
   - Finalize any ADR left in draft form from step 3.
   - Confirm the `docs/reviews/` output from step 3 is actually committed.
   - Note any process-relevant decisions for future sessions in a committed doc (this repo has no Codex-native memory store — put it in `docs/` or the PR description, not only in chat).
8. Only after Documenter close-out: ask the human before opening the PR. Reference the council synthesis and confirm the close-out happened in the PR description.

## Stop Conditions

- Missing business rule affecting data boundaries, RLS, role access, payments, or child safety.
- Build, lint, or test failures that can't be isolated from the change.
- The branch under review carries large accumulated, unreviewed history — flag this as a finding, don't merge around it.
- A branch that touches pages, API routes, or server actions where `npm run test:surfaces` fails, the CI `e2e` job isn't green, or a new surface has no `tests/coverage-manifest.json` entry and tests. The Documenter withholds sign-off until this is resolved.
