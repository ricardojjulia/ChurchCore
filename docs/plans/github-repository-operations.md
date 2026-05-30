# GitHub Repository Operations Plan

**Purpose:** Turn the ChurchCore GitHub repository into a practical execution system for roadmap tracking, security triage, releases, and disciplined collaboration.

**Source of truth:** `DEVELOPMENT_PLAN.md` remains the product and release source of truth. This plan only defines how GitHub should support that work.

**Recommended order:** Start with low-cost, high-signal features that are available for this public repository: milestones, issues, GitHub Projects, issue forms, Dependabot triage, releases, and stricter branch rules.

## Desired End State

- The development plan is reflected in GitHub milestones and a visible project board.
- Issues are structured enough to map work back to plan sections, security impact, and documentation impact.
- Security alerts have a repeatable triage flow instead of sitting as raw alerts.
- Pull requests are protected by required checks and review expectations.
- Releases summarize meaningful changes from merged work and align with the changelog.

## Phase 1: Roadmap Tracking

### 1. Create Sprint Milestones

Create one milestone per major roadmap slice:

- `Sprint 2 - Admin Dashboard & Church Setup`
- `Sprint 3 - Events & Volunteer Management`
- `Sprint 4 - Donations, Reporting & Financial Management`
- `Sprint 5 - AI Ministry Tools Phase 1`
- `Sprint 6 - Communications & Polish`
- `Launch Readiness`
- `Security & Privacy Hardening`
- `Documentation & Evaluation`

Acceptance criteria:

- Each milestone has a short description tied to `DEVELOPMENT_PLAN.md`.
- Sprint-specific issues point to one milestone.
- Cross-cutting security/docs issues use the matching cross-cutting milestone.

### 2. Create A GitHub Project

Create a repository project named `ChurchCore Execution`.

Recommended fields:

- `Status`: Backlog, Ready, In Progress, In Review, Blocked, Done
- `Sprint`: Sprint 2, Sprint 3, Sprint 4, Sprint 5, Sprint 6, Launch
- `Workstream`: App, Data, Security, Docs, CI, Design, Product
- `Risk`: Low, Medium, High, Sensitive Data
- `Plan Section`: free text or single-select for the relevant `DEVELOPMENT_PLAN.md` section

Recommended views:

- `Roadmap`: grouped by Sprint
- `Security`: filtered to Risk = Sensitive Data or Workstream = Security
- `Now`: Status = Ready or In Progress
- `Docs & Evaluation`: Workstream = Docs or Product

Acceptance criteria:

- Every new issue can be placed on the project.
- The project can answer what is next, what is blocked, and what touches sensitive data.

## Phase 2: Structured Intake

### 3. Upgrade Issue Templates To Issue Forms

Replace the current Markdown issue templates with YAML issue forms:

- `.github/ISSUE_TEMPLATE/bug-report.yml`
- `.github/ISSUE_TEMPLATE/feature-request.yml`
- `.github/ISSUE_TEMPLATE/security-privacy-review.yml`
- `.github/ISSUE_TEMPLATE/architecture-decision.yml`

Key fields:

- Summary
- Development plan section
- User role or product surface
- Expected outcome
- Security/privacy/payment/AI impact
- Documentation impact
- Validation notes

Acceptance criteria:

- Bug and feature issues require a plan-alignment field.
- Security/privacy review issues explicitly ask about PII, PHI-adjacent data, payments, AI, consent, audit, and RLS.
- Architecture decision issues require alternatives considered and ADR impact.

### 4. Tighten The PR Template

Update `.github/pull_request_template.md` so each PR answers:

- Which plan section does this implement?
- Which product surface changed?
- Does this touch PII, payments, child safety, pastoral care, AI, or auth?
- What docs changed?
- What validation ran?

Acceptance criteria:

- PRs consistently document `npm run lint` and `npm run build`.
- Sensitive changes are hard to miss during review.

## Phase 3: Security And Dependency Operations

### 5. Configure Dependabot Grouping

Add or update `.github/dependabot.yml` to group routine dependency PRs:

- `next-react-stack`
- `supabase`
- `testing-tooling`
- `eslint-typescript`
- `github-actions`

Acceptance criteria:

- Dependabot PRs are grouped enough to reduce noise.
- Security updates remain visible and easy to prioritize.

### 6. Create Security Triage Labels And Issues

Recommended labels:

- `security`
- `privacy`
- `dependencies`
- `sensitive-data`
- `rls`
- `auth`
- `payments`
- `ai-guardrails`

Create a tracking issue titled `Security triage: Dependabot and repository hardening`.

Acceptance criteria:

- The 26 reported vulnerabilities are triaged into actionable buckets.
- High severity dependency issues have clear owner/status.
- Any issue involving sensitive data is labeled accordingly.

## Phase 4: Branch And Review Discipline

### 7. Tighten Branch Rules

Recommended default-branch protections:

- Require pull request before merge.
- Require `npm run lint` / CI check.
- Require build check.
- Require CodeQL when available.
- Require branch up to date before merge.
- Block force pushes.
- Block deletions.
- Prefer linear history if the team wants a clean mainline.
- Enforce branch protections for administrators so PR-only rules cannot be bypassed during routine work.

Acceptance criteria:

- Direct pushes to `main` are no longer routine.
- Bypasses are reserved for emergency repository administration only.
- Current status: `main` has admin enforcement enabled as of 2026-05-25, so factory work should land through feature branches and pull requests.

### 8. Add Review Ownership

Expand `.github/CODEOWNERS` over time:

- App routes and components
- Supabase migrations and seed data
- Security-sensitive auth and tenant-boundary code
- Docs and plans

Acceptance criteria:

- Sensitive areas request review from the right owner automatically.
- Docs-only changes remain lightweight.

## Phase 5: Releases And Public Presentation

### 9. Add Release Drafting

Use GitHub Releases for meaningful versions that already exist in `CHANGELOG.md`.

Recommended release notes sections:

- Highlights
- Product impact
- Security/privacy impact
- Migration/setup notes
- Validation

Acceptance criteria:

- Each meaningful release has a GitHub Release.
- Release notes link back to changelog sections and relevant docs.

### 10. Add Repository Labels

Create a small, useful label set:

- `type: bug`
- `type: feature`
- `type: docs`
- `type: security`
- `type: chore`
- `surface: control-plane`
- `surface: tenant-app`
- `surface: public-portal`
- `risk: sensitive-data`
- `risk: breaking-change`
- `status: blocked`
- `status: needs-review`

Acceptance criteria:

- Labels help triage; they do not become a taxonomy project.
- Every issue has one type label and, when relevant, one surface or risk label.

## Validation Checklist

Run this after implementation:

```bash
git status --short
npm run lint
npm run build
gh repo view ricardojjulia/ChurchCore-Ops --json nameWithOwner,url,defaultBranchRef
gh issue list --limit 20
gh pr list --limit 20
```

Expected result:

- Local repo has only intentional changes staged or committed.
- Lint and build pass.
- GitHub repo resolves as `ricardojjulia/ChurchCore-Ops`.
- Issues, milestones, labels, and project structure are visible in GitHub.

## First Implementation Recommendation

Start with this sequence:

1. Create milestones and labels.
2. Create or configure the GitHub Project.
3. Upgrade issue templates to issue forms.
4. Tighten the PR template.
5. Add Dependabot grouping.
6. Triage current security alerts.
7. Tighten branch protections after the first pass proves the workflow is not too heavy.

This gives ChurchCore a visible execution system before adding stricter gates that could slow work down.
