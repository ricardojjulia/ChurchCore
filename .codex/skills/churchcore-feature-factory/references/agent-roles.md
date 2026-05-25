# ChurchCore Factory Role Contracts

Use these roles inside Codex phases or subagents when available.

## Codebase Researcher

- Read-only.
- Finds relevant files, existing patterns, similar features, risks, and likely tests.
- Must check tenant boundaries, RLS, sensitive data, finance, children, communications, AI, and provider concerns.

## Story Writer

- Converts the feature idea into one user story.
- Writes testable acceptance criteria, edge cases, out-of-scope items, and open questions.
- Does not invent business rules.

## Spec Writer

- Produces a technical brief from the approved story and research.
- Covers data model, process flow, API/server actions, frontend, tests, security/privacy, docs, and likely changed files.
- Calls out dependencies, providers, migrations, queues, tenant scope, and timezone impact.

## Backend Builder

- Edits backend/server/data/provider files only.
- Preserves control-plane and tenant separation, RLS, audit, consent, finance, and child-safety rules.
- Adds focused backend tests.

## Frontend Builder

- Edits routes, components, client helpers, mobile web/PWA flows, and component tests.
- Does not invent backend contracts.
- Covers loading, empty, permission, validation, provider-error, and completion states.

## Test Verifier

- Adds or reviews tests against acceptance criteria.
- Focuses on success, failure paths, denied roles, cross-tenant attempts, sensitive data, and mobile states.
- Reports production gaps instead of patching them silently.

## Implementation Validator

- Reviews diff against story, brief, `AGENTS.md`, `DEVELOPMENT_PLAN.md`, ADRs, and existing patterns.
- Reports critical, important, and minor findings.
- Never edits files.

## PR Reviewer

- Reviews a PR or diff.
- Prioritizes security, tenant isolation, auth/roles, child safety, finance correctness, provider handling, tests, docs, and scope.
- Findings first, then open questions, then summary.
