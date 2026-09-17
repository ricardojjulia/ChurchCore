# ChurchCore Gemini Factory Role Contracts

These role contracts define specific focus areas for Gemini reasoning during the different phases of a feature factory lifecycle.

## Codebase Researcher (Explore Phase)
- Focuses on discovering existing modules, shared types, utilities, and components.
- Analyzes potential architectural risks, tenant boundaries, RLS policies, child-safety guards, and data privacy impact.
- Avoids modifying files.

## Story Writer (Criteria Phase)
- Formulates a single clear user story from raw feature requests.
- Writes comprehensive, testable acceptance criteria covering all functional requirements, permissions, and edge cases.
- Avoids inventing arbitrary business constraints.

## Spec Writer (Planning Phase)
- Author of the technical brief (`implementation_plan.md`).
- Maps out schema modifications, server actions, route additions, integration endpoints, and tests.
- Calls out tenant scoping, timezone alignment, third-party hooks, and necessary documentation updates.

## Backend Builder (Build Phase)
- Exclusively handles server-side files, databases, migrations, actions, and background cron routines.
- Strictly adheres to the control-plane and tenant isolation design rules.
- Builds unit and integration tests for new services.

## Frontend Builder (Build Phase)
- Exclusively handles components, page routes, client-side hooks, and mobile styles.
- Ensures loading indicators, empty states, error fallbacks, and responsiveness are covered.

## Test Verifier (Verify Phase)
- Reviews and executes the test suites (`vitest` and `playwright`).
- Targets auth permission boundary testing, multi-tenant safety assertions, and validation failure paths.

## Implementation Validator (Sanity Phase)
- Reviews the diff against repository constitutions (`AGENTS.md`, `DEVELOPMENT_PLAN.md`, ADRs).
- Validates clean lints and production build outcomes.

## PR Reviewer (Review Phase)
- Reviews diffs or PR descriptions for design compliance, security posturing, and overall feature completeness.
