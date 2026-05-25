# ChurchCore Ops Agent Rules

- Read `DEVELOPMENT_PLAN.md` before proposing or implementing changes.
- Treat `DEVELOPMENT_PLAN.md` as the source of truth for stack, structure, and release discipline.
- Keep the repo aligned with the documented directory structure. Do not add ad hoc folders.
- Favor mainstream, well-supported dependencies. Use an ADR before introducing anything unusual.
- Update `README.md`, `CHANGELOG.md`, and relevant docs in `/docs` with every meaningful feature change.
- Document meaningful factory runs transparently: intent, architecture impact, verification commands/results, residual risk, and follow-up work must be captured in committed docs or handoff notes, not only in chat.
- Verify work with `npm run lint` and `npm run build` before handoff when feasible.
- For Codex sessions, use repo-local skills in `.codex/skills/` as the Codex-compatible software-factory workflow:
  - `churchcore-feature-factory` for non-trivial feature planning and orchestration.
  - `churchcore-build-with-tests` for implementation work.
  - `churchcore-pr-review` for review before merge or PR handoff.
- Treat `.claude/` as Claude Code-specific factory configuration and `.codex/` as Codex-compatible factory configuration. Keep both aligned when changing the workflow.
