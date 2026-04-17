# Security Policy

ChurchForge handles sensitive church workflows, including child-safety operations, finance, member data, and role-restricted administrative actions. Treat security reports seriously and keep disclosure private.

## Reporting a Vulnerability

- Do not open a public issue with exploit details.
- Report vulnerabilities privately to the repository owner or maintainers through the private channel already used for project coordination.
- Include affected area, reproduction steps, impact, and any mitigation you have already verified.

## Scope Priorities

Please prioritize reports involving:

- authentication or session handling
- privilege escalation or broken role boundaries
- exposure of member, family, or child-safety data
- finance, donation, or ledger tampering
- unsafe local bootstrap or secret-handling paths
- AI or communication features that bypass consent or audit expectations

## Repository Baseline

This repository is configured for:

- CI verification via `npm run check`
- CodeQL analysis
- pull-request dependency review
- secret scanning in GitHub Actions

Enable GitHub secret scanning, push protection, code scanning, Dependabot alerts, and dependency graph support in the GitHub repository settings immediately after the first push. See `docs/private-repo-launch-checklist.md`.
