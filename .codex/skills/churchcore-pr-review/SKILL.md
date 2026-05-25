---
name: churchcore-pr-review
description: Use when reviewing ChurchCore Ops diffs, commits, or PRs in Codex before merge, push, handoff, or release.
---

# ChurchCore PR Review

Use a code-review stance. Findings come first.

## Read First

1. `AGENTS.md`
2. `DEVELOPMENT_PLAN.md`
3. Relevant ADRs
4. Current diff or PR context

## Review Checklist

Prioritize:

1. **Critical:** security, tenant isolation, auth/role bypass, RLS gaps, child safety, financial correctness, secrets, data loss, production breakage.
2. **Important:** missing acceptance criteria, missing tests, incomplete provider lifecycle, migration risks, docs omissions, broken mobile path.
3. **Minor:** maintainability, naming, polish, or consistency concerns.

Always check:

- Scope is coherent and avoids unrelated refactors.
- Tests match changed behavior and risk.
- Sensitive data is masked, scoped, audited, and not logged.
- Control-plane and tenant boundaries remain intact.
- `README.md`, `CHANGELOG.md`, and docs are updated for meaningful changes.
- Verification status is reported.

## Output

Return:

1. Findings with file/line references when possible.
2. Open questions.
3. Brief change summary only after findings.
4. Verification gaps or residual risk.
