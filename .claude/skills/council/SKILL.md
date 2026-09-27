---
name: council
description: Runs the ChurchCore Ops council review — 4-agent read-only audit plus Documenter close-out — per improve-software.md. Use before any non-trivial merge to main, or when asked to run the council, /improve-software, or an MVP/status audit.
---

# ChurchCore Council

This is the Claude Code entrypoint for the protocol defined in `improve-software.md` at the repo root — that file is the source of truth; this skill wires it into Claude subagents. Read it in full before running the council.

Mandate: per `AGENTS.md` and `improve-software.md` §0, the council runs before every non-trivial merge to `main`. Small, isolated fixes may skip it; being in a hurry does not qualify.

## Chain

1. Read `AGENTS.md`, `DEVELOPMENT_PLAN.md`, and `improve-software.md` §0–2 for the current mandate and prompts.
2. Spawn the four read-only audit agents in parallel using `codebase-researcher` (or `general-purpose` for agents whose prompt needs broader tool access) with the exact Phase 1 prompts from `improve-software.md`, substituting the real repo root.
3. Synthesize: group cross-agent consensus findings, draft ADRs under `docs/adr/` for any new boundary/pattern/contract, and write `docs/reviews/YYYY-MM-DD-council-review-[N]-synthesis.md` plus the four agent reports.
4. Ask the human to approve the synthesis and prompt sequence before implementation.
5. Execute approved prompts via `feature-factory` / `build-with-tests`, sequentially for write phases.
6. Verify: `npm run test`, `npm run lint`, `npm run build` must all be clean. A red result is a stop condition — do not proceed to step 7.
7. Invoke the `documenter` subagent (`.claude/agents/documenter.md`) to update `DEVELOPMENT_PLAN.md` (the §0 roadmap tracker rows and progress line first, then the history), `CHANGELOG.md`, README/docs, finalize ADRs, confirm `docs/reviews/` output is committed, and update memory.
8. Only after Documenter sign-off: ask the human before opening the PR. The PR description must reference the council synthesis and confirm Documenter sign-off.

## Rules

- Agents 1–4 are read-only; never let them edit files.
- Documenter is write-role but scoped to docs/changelog/plan/ADRs/memory only — never application code.
- Do not skip step 6 to save time; a build/test failure routes back to the relevant builder, not to Documenter.
- If this is being run against a branch with accumulated, unreviewed history (not a fresh feature branch), say so explicitly in the synthesis — that's itself a council finding.
- Before Documenter sign-off, confirm `npm run test:surfaces` passes and the CI `e2e` job is green for any branch that touches pages, API routes, or server actions. A branch that adds surfaces without manifest entries and tests is not ready.
