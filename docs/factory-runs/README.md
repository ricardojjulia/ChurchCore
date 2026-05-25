# Factory Run Tracker

This directory records meaningful software-factory runs for ChurchCore Ops.

Each run file should be committed with the change it describes. The goal is to make the AI-assisted development trail inspectable without relying on chat history.

## Required Run Record Sections

- **Intent:** what problem the run addressed.
- **Factory workflow:** which Claude Code or Codex workflow was used.
- **Story and acceptance criteria:** the behavior the run was meant to satisfy.
- **Technical brief:** architecture, data, tenant boundary, RBAC, sensitive-data, and documentation impact.
- **Implementation summary:** files changed and patterns reused.
- **Verification:** exact commands and pass/fail results.
- **Residual risk:** known gaps, pre-existing failures, or follow-up work.
- **Commit:** final commit hash after push.

## Runs

| Date | Run | Scope | Commit |
| --- | --- | --- | --- |
| 2026-05-25 | [Readiness module-owned builders](2026-05-25-readiness-module-builders.md) | Split setup, accounts, and people readiness into module builders | `043db58` |
