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
- **Delivery:** branch, pull request, merge method, and final commit or merge hash.

## Runs

| Date | Run | Scope | Delivery |
| --- | --- | --- | --- |
| 2026-05-25 | [Readiness module-owned builders](2026-05-25-readiness-module-builders.md) | Split setup, accounts, and people readiness into module builders | `043db58` |
| 2026-05-25 | [Enforce PR delivery workflow](2026-05-25-enforce-pr-delivery-workflow.md) | Enable admin branch-protection enforcement and document branch/PR delivery | PR #11, squash merge `7538a86` |
| 2026-05-25 | [Readiness events and volunteers](2026-05-25-readiness-events-volunteers.md) | Split weekend event and volunteer readiness into module builders | PR #12, squash merge `eed10c8` |
| 2026-05-25 | [Readiness children's ministry](2026-05-25-readiness-children-ministry.md) | Split children's ministry readiness into a module builder | PR #14, squash merge `604a703` |
| 2026-05-26 | [Release version 3.0.0](2026-05-26-release-version-3-0-0.md) | Recalculate the accumulated release as a SemVer major baseline | PR #16, squash merge `3d23855` |
| 2026-05-26 | [Readiness giving and finance](2026-05-26-readiness-giving-finance.md) | Split giving and finance readiness into a module builder | PR #18, squash merge `ff57b0c` |
| 2026-05-26 | [Readiness suggested workflows](2026-05-26-readiness-suggested-workflows.md) | Split suggested workflow readiness into a module builder | PR #20, squash merge `307263c` |
| 2026-05-26 | [Readiness communications](2026-05-26-readiness-communications.md) | Add communications readiness to the weekly operator path | PR #22, squash merge `d1376cc` |
| 2026-05-26 | [Readiness reports](2026-05-26-readiness-reports.md) | Add reports readiness to the weekly operator path | PR #25, squash merge `c231ca7` |
| 2026-05-26 | [Readiness route smoke](2026-05-26-readiness-route-smoke.md) | Expand local smoke coverage across weekly readiness targets | PR #27, squash merge `d54ab85` |
| 2026-05-26 | [Readiness Playwright smoke](2026-05-26-readiness-playwright-smoke.md) | Add browser-level coverage across weekly readiness targets | PR #29, squash merge `4608bf8` |
| 2026-05-26 | [Readiness denied-role Playwright](2026-05-26-readiness-denied-role-playwright.md) | Add tenant denied-role browser coverage for ChurchAdmin-only readiness targets | Pending |
