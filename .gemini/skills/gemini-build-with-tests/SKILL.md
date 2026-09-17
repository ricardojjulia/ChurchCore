---
name: gemini-build-with-tests
description: Use when implementing or extending ChurchCore Ops features, fixing bugs, or modifying code in Gemini (Antigravity).
---

# ChurchCore Gemini Build With Tests

Use this workflow for all active code modification, refactoring, and bug fixing tasks in Gemini.

## Required Context

Always verify repository state and guidelines before editing:
1. `AGENTS.md`
2. `DEVELOPMENT_PLAN.md`
3. Relevant ADRs in `docs/adr/`
4. Relevant module documentation under `docs/`
5. Approved `implementation_plan.md` (when applicable)

## Workflow

1. **Research First:** Use `grep_search` and `list_dir` to inspect similar modules and identify existing patterns to reuse.
2. **Code Modification:** Modify code in small, coherent vertical slices. Maintain docstrings and unrelated code comments.
3. **Task Tracking:** If performing multi-step edits, create/update `task.md` to track incomplete (`[ ]`), in-progress (`[/]`), and completed (`[x]`) tasks.
4. **Test Alignment:** Add or update focused unit/integration tests (`vitest`) or E2E tests (`playwright`) matching the updated logic.
5. **Project Validation:** Run `npm run lint` and `npm run build` to confirm code safety and correct type definitions.
6. **Handoff:** Document changes and verification steps clearly in the response.

## Core Rules
- **Data Boundaries:** Keep the control-plane and tenant data surfaces strictly isolated.
- **Security & Privacy:** Enforce tenant-scoped Row Level Security (RLS) policies. Do not expose raw database errors, secrets, provider payloads, child-sensitive data, or pastoral notes.
- **Dependencies:** Avoid adding new packages unless explicitly approved via ADR.
