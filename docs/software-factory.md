# ChurchCore Ops Software Factory

**Status:** Active workflow guide  
**Date:** 2026-05-25  
**Applies to:** Claude Code and Codex sessions in this repository

## Purpose

The software factory is a small set of repository files that turns AI-assisted development into a repeatable workflow. It keeps ChurchCore Ops work aligned with `DEVELOPMENT_PLAN.md`, ADRs, tenant boundaries, role access, sensitive-data rules, tests, and release discipline.

The factory has two compatible surfaces:

- **Claude Code:** `.claude/agents/`, `.claude/skills/`, `.claude/hooks/`, and `.claude/settings.example.json`
- **Codex:** `.codex/skills/` plus the shared rules in `AGENTS.md`

Both surfaces follow the same chain:

```text
research -> story -> spec -> backend/frontend build -> tests -> validation -> PR review
```

## File Map

| Path | Used by | Purpose |
| --- | --- | --- |
| `CLAUDE.md` | Claude Code | Project entrypoint. Delegates to `AGENTS.md`. |
| `AGENTS.md` | Claude Code and Codex | Shared project rules, source-of-truth docs, verification expectations, and Codex skill pointers. |
| `.claude/agents/*.md` | Claude Code | Focused project agents: researcher, story writer, spec writer, backend builder, frontend builder, test verifier, validator, PR reviewer. |
| `.claude/skills/build-with-tests/SKILL.md` | Claude Code | Implementation workflow and verification rules. |
| `.claude/skills/feature-factory/SKILL.md` | Claude Code | Orchestrates the full feature chain. |
| `.claude/hooks/pre-commit.sh` | Claude Code / shell | Blocks obvious sensitive files from being staged for commit. |
| `.claude/settings.example.json` | Claude Code | Example hook wiring. Copy relevant parts into local `.claude/settings.json`; do not commit local settings. |
| `.codex/skills/churchcore-feature-factory/SKILL.md` | Codex | Codex-compatible feature workflow. |
| `.codex/skills/churchcore-build-with-tests/SKILL.md` | Codex | Codex-compatible implementation workflow. |
| `.codex/skills/churchcore-pr-review/SKILL.md` | Codex | Codex-compatible PR/diff review checklist. |
| `.codex/skills/churchcore-feature-factory/references/agent-roles.md` | Codex | Role contracts that mirror Claude agents. |

## Claude Code How-To

### 1. Start With Repository Rules

Claude Code loads `CLAUDE.md`, which points to `AGENTS.md`. Before meaningful work, the session should read:

1. `DEVELOPMENT_PLAN.md`
2. relevant docs in `docs/`
3. relevant ADRs in `docs/adr/`
4. `.claude/skills/build-with-tests/SKILL.md` for implementation work

### 2. Use The Feature Factory

For non-trivial feature work, ask Claude Code to use the feature factory:

```text
Use the feature-factory skill to build the enabled-session children's check-in flow.
Start with research only and pause after the story and technical brief.
```

Expected flow:

1. `codebase-researcher` maps files, patterns, risks, and tests.
2. `story-writer` writes the user story and acceptance criteria.
3. Human approves or revises the story.
4. `spec-writer` writes the technical brief.
5. Human approves or revises the brief.
6. `backend-builder` implements server/data/provider work.
7. `frontend-builder` implements routes/components/mobile web UI.
8. `test-verifier` adds or reviews tests against the story.
9. `implementation-validator` reviews the result.
10. `pr-reviewer` reviews the final diff or PR when requested.

### 3. Wire The Safety Hook

`.claude/settings.example.json` shows a hook configuration that runs `.claude/hooks/pre-commit.sh` before Claude Code attempts `git commit`.

Keep local permissions and settings in `.claude/settings.json`. That file remains ignored because it can contain machine-specific commands or local secrets.

### 4. Finish Work

Before handoff, Claude Code should report:

- files changed
- behavior added or changed
- docs updated
- verification commands and results
- known residual risks or pre-existing failures

Run when feasible:

```bash
npm run lint
npm run build
```

Use `npm test` for implementation work where the test suite is expected to pass or when changing tested behavior.

## Codex How-To

Codex does not consume `.claude/agents/*.md` as native Claude subagents. The Codex-compatible setup uses repo-local skills instead.

### 1. Start With Repository Rules

Codex should read:

1. `AGENTS.md`
2. `DEVELOPMENT_PLAN.md`
3. relevant ADRs and docs
4. one of the `.codex/skills/` workflows

### 2. Use Codex Skills

For feature work:

```text
Use the churchcore-feature-factory skill to plan and implement the mobile web member check-in flow.
Pause before implementation if the story or technical brief has unresolved product rules.
```

For implementation work:

```text
Use the churchcore-build-with-tests skill to implement the approved brief.
```

For review:

```text
Use the churchcore-pr-review skill to review this diff before merge.
```

### 3. Codex Role Mapping

Codex maps the Claude agents into phases described in `.codex/skills/churchcore-feature-factory/references/agent-roles.md`:

- Codebase Researcher -> exploration phase
- Story Writer -> acceptance criteria phase
- Spec Writer -> technical brief phase
- Backend Builder -> server/data/provider implementation phase
- Frontend Builder -> route/component/mobile UI implementation phase
- Test Verifier -> acceptance and edge-case test phase
- Implementation Validator -> final implementation review phase
- PR Reviewer -> PR/diff review phase

Codex can run read-only exploration in parallel, but write phases must be sequential.

### 4. Finish Work

Codex should end with:

- files changed
- behavior added or changed
- verification commands and results
- residual risks or pre-existing failures

Run when feasible:

```bash
npm run lint
npm run build
```

## Diagrams

The canonical visual references are:

- [Claude Code software factory](assets/diagrams/software-factory-claude.svg)
- [Codex software factory](assets/diagrams/software-factory-codex.svg)

Mermaid source is also included in [docs/diagrams.md](diagrams.md).

## Operating Rules

- Research before implementation.
- Human approval is required after story and technical brief for non-trivial features.
- Read-only phases can run in parallel.
- Write phases run sequentially.
- Keep features as coherent vertical slices.
- Update docs and changelog for meaningful changes.
- Do not claim success without verification evidence.
- Keep Claude and Codex workflow files aligned when changing factory behavior.
