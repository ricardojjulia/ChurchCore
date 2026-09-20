# ChurchCore Agent Rules

- Read `DEVELOPMENT_PLAN.md` before proposing or implementing changes.
- Treat `DEVELOPMENT_PLAN.md` as the source of truth for stack, structure, and release discipline.
- Keep the repo aligned with the documented directory structure. Do not add ad hoc folders.
- Favor mainstream, well-supported dependencies. Use an ADR before introducing anything unusual.
- Update `README.md`, `CHANGELOG.md`, and relevant docs in `/docs` with every meaningful feature change.
- Document meaningful factory runs transparently: intent, architecture impact, verification commands/results, residual risk, and follow-up work must be captured in committed docs or handoff notes, not only in chat.
- Verify work with `npm run lint` and `npm run build` before handoff when feasible.
- Do not push directly to `main`. Use a feature branch, push the branch, open a pull request, merge through GitHub after required checks/review, then pull `main`.
- **The Council runs before every non-trivial merge to `main`.** This is a mandate, not a suggestion — see `improve-software.md` §0 for scope and exceptions. The Council is 4 read-only audit agents (database/API, routes/pages, UX/shell, feature/competitive) plus a 5th **Documenter** agent that closes the loop: updates `DEVELOPMENT_PLAN.md`, `CHANGELOG.md`, README/docs, finalizes ADRs, and records memory after verification is clean. A PR for non-trivial work references its council synthesis (`docs/reviews/`) and confirms Documenter sign-off in the description.
- For Claude Code sessions, use repo-local skills in `.claude/skills/` as the Claude-compatible software-factory workflow:
  - `council` to run the Council review and Documenter close-out (`.claude/skills/council/`, subagent `.claude/agents/documenter.md`).
  - `feature-factory` for non-trivial feature planning and orchestration.
  - `build-with-tests` for implementation work.
- For Codex sessions, use repo-local skills in `.codex/skills/` as the Codex-compatible software-factory workflow:
  - `churchcore-council` to run the Council review and Documenter close-out.
  - `churchcore-feature-factory` for non-trivial feature planning and orchestration.
  - `churchcore-build-with-tests` for implementation work.
  - `churchcore-pr-review` for review before merge or PR handoff.
- For Gemini (Antigravity) sessions, use repo-local skills in `.gemini/skills/` as the Gemini-compatible software-factory workflow:
  - `gemini-council` to run the Council review and Documenter close-out.
  - `gemini-feature-factory` for non-trivial feature planning and orchestration.
  - `gemini-build-with-tests` for implementation work.
  - `gemini-pr-review` for review before merge or PR handoff.
- Treat `.claude/` as Claude Code-specific factory configuration, `.codex/` as Codex-compatible factory configuration, and `.gemini/` as Gemini-specific factory configuration. Keep all surfaces aligned when changing the workflow — the Council and Documenter mandate applies identically across all three.


<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
