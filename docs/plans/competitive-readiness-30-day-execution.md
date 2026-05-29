# Competitive Readiness 30-Day Execution Plan

Date: 2026-05-28
Owner: ChurchCore Ops product + engineering
Status: Active execution plan

## Purpose

This is the current short-horizon execution plan to close the biggest MVP and competitive gaps identified in:

- `docs/mvp-readiness-audit.md`
- `docs/plans/competitive-readiness-roadmap.md`

The plan focuses on shippable slices with explicit verification commands and done criteria.

## Success Criteria (30 days)

1. Paid event registration flow has a payment-record lifecycle connected to Stripe intent metadata and admin visibility.
2. Communications provider lifecycle reaches operationally credible retry/suppression/bounce handling.
3. Import/migration starts with staged people+household CSV ingest and dry-run reporting.
4. Security/role evidence improves through executable tests and updated docs.
5. Weekly operator path remains green while these slices land.

## Slice Plan

### Slice 1 (Now): Registration Payment Foundation

Goal: Start Finding 4 step 6 with durable payment records and payment status scaffolding.

Scope:

- add `event_registration_payments` table + RLS
- add `payment_status` on `event_registrations`
- write payment-required defaults in member/public/admin registration actions
- keep current UX stable (no breaking UI dependency)

Done when:

- migration applies cleanly
- registration writes set `payment_status` appropriately (`pending` for paid, `not_required` for free/waitlisted)
- lint/build + targeted tests pass

Verification:

- `npm run test -- app/app/member-actions.test.ts app/app/church-admin-actions.test.ts`
- `npm run lint`
- `npm run build`

Status: Completed (foundation delivered on main working tree; pending commit/PR)

### Slice 2: ChurchAdmin Payment Visibility For Event Registrations

Goal: Operators can see registration payment state and basic payment references on event roster views.

Scope:

- extend event registration data contracts with payment status summary
- add roster-level payment badges and filters
- add safe empty/error states

Done when:

- ChurchAdmin event registration workspace surfaces payment state by registrant
- no role leakage outside allowed routes

Status: Completed (payment visibility shipped in workspace; pending commit/PR)

### Slice 3: Communications Provider Lifecycle Hardening

Goal: Close core Finding 3 operational gaps.

Scope:

- retry eligibility normalization
- suppression/bounce/unsubscribe consistency across send + webhook
- operational lane cues for unresolved delivery failures

Done when:

- provider webhook states map deterministically
- retry and suppression actions are auditable and test-covered

Status: Completed (lifecycle hardening shipped in workspace; pending commit/PR)

### Slice 4: Migration/Import Foundation (People + Households)

Goal: Start Finding 5 with a dry-run-safe migration path.

Scope:

- staging schema for import batches + rows
- CSV people/household parser and validator
- dry-run summary (create/update/skip/reject)

Done when:

- ChurchAdmin can run a dry import and see deterministic summary results without production writes

Status: Completed (dry-run people/household import foundation shipped in workspace; pending commit/PR)

### Slice 5: Security Evidence Closure Sprint

Goal: Move compliance claims from architecture to proof.

Scope:

- role-access test matrix expansion for sensitive routes/actions
- RLS and cross-tenant negative tests for new slices
- security docs evidence updates

Done when:

- tests and docs provide concrete evidence for claims in security and roadmap docs

Status: Completed (role-access and church-scope negative evidence added for Slice 2-4 routes/actions; docs refreshed)

### Slice 6: Communications Dispatch Guardrails and Operator Polish

Goal: Reduce accidental messaging errors and improve operator confidence in queued/scheduled dispatch workflows.

Scope:

- add server-side guardrails for communications broadcasts:
  - reject empty message body
  - require email subject for email broadcasts
  - reject invalid or non-future scheduled dispatch times
- add compose-side validation for missing subject and invalid schedule times
- add schedule input guardrail (`datetime-local` minimum) to reduce past-time selection mistakes
- add targeted communications action tests for these new dispatch constraints

Done when:

- invalid broadcast payloads are rejected before provider dispatch
- valid future-scheduled broadcasts normalize payloads correctly
- targeted tests, lint, and build pass

Status: Completed (dispatch validation, compose guardrails, and action test coverage shipped on main)

### Slice 7: Paid Registration Lifecycle Defaults Completion

Goal: Ensure paid event registrations always persist deterministic payment lifecycle defaults across ChurchAdmin, member, and public registration entry points.

Scope:

- enforce `payment_status` writes on event registration inserts
- set `payment_status = pending` for paid, non-waitlisted registrations
- set `payment_status = not_required` for free or waitlisted registrations
- add focused tests for ChurchAdmin/member paid registration default behavior

Done when:

- all registration entry points persist payment lifecycle defaults consistently
- targeted tests, lint, and build pass

Status: Completed (payment default persistence and action tests shipped)

### Slice 8: Import Commit Workflow and Vendor Source Adapters

Goal: Expand migration tooling beyond dry run by adding source adapters and explicit commit/audit flow for people+household imports.

Scope:

- add import source-system adapters (`generic_csv`, `planning_center`, `breeze`, `pushpay_ccb`)
- add source-system selection in ChurchAdmin people import workspace
- add ChurchAdmin commit action for dry-run-completed import batches
- commit create/update rows into canonical profiles/families with batch status and summary updates
- add tests for dry-run source forwarding and commit role/backend gates

Done when:

- dry runs support vendor-specific alias mapping inputs
- ChurchAdmin can commit a dry-run batch with auditable committed/failed summary output
- targeted tests, lint, and build pass

Status: Completed (source adapters, commit action/workspace controls, and tests shipped)

### Slice 9: Security Evidence Matrix Expansion

Goal: Expand Finding 6 evidence from isolated tests into a role-access matrix with direct verification links and refreshed security docs.

Scope:

- add a role-access matrix doc for sensitive route/action surfaces
- refresh security assessment and mitigation docs with new import commit and payment lifecycle evidence
- refresh testing schema references for new import and payment regression coverage

Done when:

- matrix and security docs reference executable evidence paths
- documentation and verification records are updated alongside implementation

Status: Completed (matrix doc and security/testing evidence updates shipped)

## Weekly Cadence

- Day 1-2: implement + test first slice
- Day 3: docs + evidence + merge
- Day 4-5: next slice kickoff + verification

## Traceability

Each slice must update:

- `CHANGELOG.md`
- `docs/factory-runs/` with commands/results and residual risks
- relevant sections in `docs/application-guide.md` or roadmap docs when behavior changes
