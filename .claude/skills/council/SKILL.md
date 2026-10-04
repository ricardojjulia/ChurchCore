---
name: council
description: Runs the ChurchCore Ops council review — 5-agent read-only audit (data/API, routes/pages, UX/shell, feature/competitive, security) plus Documenter close-out — per improve-software.md. Use before any non-trivial merge to main, or when asked to run the council, /improve-software, or an MVP/status audit.
---

# ChurchCore Council

This is the Claude Code entrypoint for the protocol defined in `improve-software.md` at the repo root — that file is the source of truth; this skill wires it into Claude subagents. Read it in full before running the council.

Mandate: per `AGENTS.md` and `improve-software.md` §0, the council runs before every non-trivial merge to `main`. Small, isolated fixes may skip it; being in a hurry does not qualify.

## Chain

1. Read `AGENTS.md`, `DEVELOPMENT_PLAN.md`, and `improve-software.md` §0–2 for the current mandate and prompts.
2. Spawn the five read-only audit agents in parallel (Council v2: Agent 5 is Security) using `codebase-researcher` (or `general-purpose` for agents whose prompt needs broader tool access) with the exact Phase 1 prompts from `improve-software.md`, substituting the real repo root.
3. Synthesize: group cross-agent consensus findings, draft ADRs under `docs/adr/` for any new boundary/pattern/contract, and write `docs/reviews/YYYY-MM-DD-council-review-[N]-synthesis.md` plus the five agent reports. Open the synthesis with a Status (RATIFIED / AMENDED / REJECTED, the Council's recommendation; the owner decides), check every agent claim against source before adopting it, and list the claims that proved wrong. Use the synthesis header block (Date, Branch, Related, Tags, Surfaces) and close it with the definition-of-done checklist, ticked only with evidence (`improve-software.md` Phase 2, §0 and §5).
4. Ask the human to approve the synthesis and prompt sequence before implementation.
5. Execute approved prompts via `feature-factory` / `build-with-tests`, sequentially for write phases.
6. Verify: `npm run test`, `npm run lint`, `npm run build` must all be clean. A red result is a stop condition — do not proceed to step 7.
7. Invoke the `documenter` subagent (`.claude/agents/documenter.md`) to update `DEVELOPMENT_PLAN.md` (the §0 roadmap tracker rows and progress line first, then the history), `CHANGELOG.md`, README/docs, finalize ADRs, confirm `docs/reviews/` output is committed, and update memory.
8. Only after Documenter sign-off: ask the human before opening the PR. The PR description must reference the council synthesis and confirm Documenter sign-off.

## Rules

- Agents 1–5 are read-only; never let them edit files. Each is a separate agent with its own brief; never let one response vote as several seats.
- A branch with a migration also needs: `npm run lint:migrations`, a clean apply to a freshly reset database (`./supabase/scripts/setup-e2e.sh --reset`), backwards-compatibility with the code running before deploy, and a stated rollback (improve-software.md Phase 3, item 4).
- Documenter is write-role but scoped to docs/changelog/plan/ADRs/memory only — never application code.
- Do not skip step 6 to save time; a build/test failure routes back to the relevant builder, not to Documenter.
- If this is being run against a branch with accumulated, unreviewed history (not a fresh feature branch), say so explicitly in the synthesis — that's itself a council finding.
- Before Documenter sign-off, confirm `npm run test:surfaces` passes and the CI `e2e` job is green for any branch that touches pages, API routes, or server actions. A branch that adds surfaces without manifest entries and tests is not ready.
