---
name: gemini-pr-review
description: Use when performing code reviews on ChurchCore Ops diffs, commits, or PRs in Gemini (Antigravity).
---

# ChurchCore Gemini PR Review

Use a strict, code-review-first stance. Prioritize safety, design principles, and project rules.

## Read First
1. `AGENTS.md`
2. `DEVELOPMENT_PLAN.md`
3. Relevant ADRs (e.g. ADR 0002 for database separation)
4. Current diff or PR context

## Review Checklist

Prioritize findings in the following order:

1. **Critical:**
   - Security breaches (auth bypasses, role escapes, hardcoded keys).
   - Tenant isolation gaps or database boundary bleed.
   - Missing or recursive RLS policies.
   - Child-safety gaps (custody restrictions, PIN checks).
   - Financial bookkeeping / double-entry GL logic errors.
   - Data loss risks or breaking production builds.

2. **Important:**
   - Missing acceptance criteria or incomplete test coverage.
   - Unhandled integration provider failure cases (Stripe, Twilio, Resend).
   - Omitted or outdated documentation updates (`README.md`, `CHANGELOG.md`, `docs/*`).
   - Incomplete mobile web layouts/navigation flow.

3. **Minor:**
   - Maintainability, code style, naming conventions, or folder structures.

## Output Format
Generate your report structure as follows:
1. **Findings:** Bulleted list of items categorized by severity, pointing to exact file paths and line ranges.
2. **Open Questions:** Architectural or product design questions requiring user alignment.
3. **Change Summary:** A brief summary of what the pull request achieves.
4. **Verification Status:** Unresolved validation gaps or residual risks.
