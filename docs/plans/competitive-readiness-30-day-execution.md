# Competitive Readiness 30-Day Execution Plan

Date: 2026-05-28
Owner: ChurchCore product + engineering
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

### Slice 10: Service Plan Event Linkage

Goal: Make service plans an event-linked ChurchAdmin workflow instead of a standalone volunteer surface.

Scope:

- expose existing church events as optional service-plan links in create and edit flows
- validate linked events against church scope before writes
- surface linked-event context inside the service-plan workspace
- add focused service-plan action and page tests for event linkage

Done when:

- ChurchAdmin can create or update a service plan with an optional linked event
- event linkage remains church-scoped and test-covered
- targeted tests pass

Status: Completed (event-linked service-plan create/edit workflow and focused tests shipped)

### Slice 11: Service Plan Event-Ops Bridge

Goal: Connect event-linked service plans to downstream event operations and assignment records.

Scope:

- persist linked service-plan `event_id` values into volunteer assignment writes
- add direct linked-event navigation from service-plan detail
- extend focused tests for event-linked assignment writes

Done when:

- assignments created from event-linked plans retain `event_id` linkage
- operators can jump from service-plan detail into the linked ChurchAdmin event workspace
- targeted tests and lint pass

Status: Completed (event-linked assignment propagation and linked-event navigation shipped)

### Slice 12: Linked Event Roster and Check-In Actions From Service Plans

Goal: Let ChurchAdmin complete key event operations from the linked service-plan workflow without route switching for each volunteer action.

Scope:

- surface linked event roster/attendance state in service-plan detail
- add "Add to Event Roster" action for assigned volunteers not yet on the linked event roster
- add "Check In on Event" action for assigned volunteers not yet checked in on the linked event
- add focused tests for linked-event data wiring into service-plan detail

Done when:

- service-plan detail can trigger linked event roster/check-in actions for assigned volunteers
- linked-event state updates in the UI after successful actions
- targeted tests and lint pass

Status: Completed (linked event roster/check-in actions and focused page coverage shipped)

## Wave B (Current)

### P0 Slice B1: Payment Lifecycle Operational Closeout

Goal: Persist and reconcile registration payment records end-to-end from registration creation through Stripe webhook outcomes, with explicit ChurchAdmin follow-up controls and aligned visibility.

Scope:

- persist registration payment ledger rows (`event_registration_payments`) at registration creation when payment is required
- reconcile both `event_registrations` and `event_registration_payments` for Stripe webhook success/failure outcomes
- add ChurchAdmin operator action for unresolved payment follow-up resolution (status + note + actor)
- keep ChurchAdmin registration visibility aligned with reconciled records and payment status states
- ship as one vertical slice with tests-first implementation and gate validation

Done when:

- paid registration paths (ChurchAdmin, member, public portal) write deterministic ledger records
- Stripe webhook updates registration + payment ledger records for success/failure outcomes
- ChurchAdmin can resolve unresolved payments via follow-up action and notes
- requested tests, lint, and build pass

Verification:

- `npm run test -- member-actions.test.ts church-admin-actions.test.ts actions.test.ts`
- `npm run lint`
- `npm run build`

Status: In Progress

## Weekly Cadence

- Day 1-2: implement + test first slice
- Day 3: docs + evidence + merge
- Day 4-5: next slice kickoff + verification

## Traceability

Each slice must update:

- `CHANGELOG.md`
- `docs/factory-runs/` with commands/results and residual risks
- relevant sections in `docs/application-guide.md` or roadmap docs when behavior changes

## Execution Governance (Future Sessions)

Use this section as the continuity contract for every future implementation session.

### Session Start Checklist

1. Read this file top-to-bottom and confirm the active wave table below.
2. Continue exactly one `In Progress` slice until it meets done criteria.
3. If no slice is `In Progress`, promote the highest-priority `Planned` slice.
4. Do not start a new slice before the current slice has tests, docs, and validation evidence.

### Session End Checklist

1. Update the active wave table status and last update date.
2. Append verification commands/results to a new file in `docs/factory-runs/`.
3. Update `CHANGELOG.md` and any user-facing docs impacted by behavior changes.
4. Run and record validation gates:
  - `npm run lint`
  - `npm run build`
  - targeted tests for changed surfaces

### Status Definitions

- `Planned`: scoped, acceptance criteria defined, not yet implemented.
- `In Progress`: implementation started in branch/worktree.
- `Blocked`: cannot proceed due to dependency or unresolved defect.
- `Completed`: merged to `main` with docs and verification evidence.

## Active Wave A: Replacement-Critical Gaps (2026-05-30)

Purpose: close the next three replacement-critical gaps with tightly scoped, merge-ready slices.

| Slice ID | Slice | Priority | Status | Owner | Last Update |
| --- | --- | --- | --- | --- | --- |
| A1 | Event-ops UI navigation completion from service-plan workflows | P0 | Completed | Product + Engineering | 2026-05-30 |
| A2 | Volunteer scheduling completion (responses, reminders, coverage states) | P0 | Completed | Product + Engineering | 2026-05-30 |
| A3 | Event registration/payments foundation hardening | P0 | Completed | Product + Engineering | 2026-05-30 |

### A1: Event-Ops UI Navigation Completion

Goal: eliminate route-hopping friction by making linked event operations reachable directly from service-plan context.

Scope:

- ensure linked event quick actions are visible from service-plan list and detail contexts
- provide direct navigation to linked event roster, attendance, and registration subviews
- preserve church-scoped guards and role checks on all linked navigation targets

Acceptance criteria:

1. ChurchAdmin can navigate from service plans to linked event operations in one interaction.
2. Missing or unlinked event states render explicit fallback guidance (no dead links).
3. Route-level tests cover linked and unlinked states.

Validation:

- `npm run test -- app/app/church-admin/volunteers/schedules/page.test.tsx "app/app/church-admin/volunteers/schedules/[id]/page.test.tsx"`
- `npm run lint`
- `npm run build`

Status: Completed (service-plan list/detail now provide direct linked navigation to event roster, attendance, and registrations, with unavailable-link fallback guidance; validation gates passed)

### A2: Volunteer Scheduling Completion (Responses + Reminders)

Goal: raise volunteer scheduling from partial coverage to operational reliability.

Scope:

- add assignment response states (pending, accepted, declined) with timestamps
- add reminder triggers and reminder history for unconfirmed assignments
- expose coverage and response gaps in service-plan/operator views

Acceptance criteria:

1. Assignment responses are persisted and visible in scheduler views.
2. Reminders can be sent and are auditable per assignment.
3. Coverage dashboards clearly identify unresolved roles.

Validation:

- `npm run test -- app/app/volunteer-actions.test.ts app/app/church-admin/volunteers/schedules/page.test.tsx "app/app/church-admin/volunteers/schedules/[id]/page.test.tsx"`
- `npm run lint`
- `npm run build`

Status: Completed (assignment responses now include visible response timestamps, pending assignments support auditable reminder logging, and service-plan list/detail surfaces explicit coverage and response gaps)

### A3: Event Registration/Payments Foundation Hardening

Goal: move registration payment lifecycle from baseline to operationally reliable defaults and visibility.

Scope:

- enforce deterministic payment lifecycle writes across all registration entry points
- normalize paid/free/waitlist status handling in ChurchAdmin, member, and public flows
- strengthen payment-state visibility and filters in event workspace views

Acceptance criteria:

1. Registration payment status is deterministic across all entry points.
2. ChurchAdmin can filter and review payment state without manual reconciliation.
3. Regression tests cover lifecycle defaults and visibility filters.

Validation:

- `npm run test -- app/app/member-actions.test.ts app/app/church-admin-actions.test.ts app/portal/actions.test.ts lib/event-registration-lifecycle.test.ts`
- `npm run lint`
- `npm run build`

Status: Completed (registration lifecycle writes now resolve through shared deterministic status/payment logic across ChurchAdmin, member, and public entry points; ChurchAdmin event registration views now include payment follow-up filtering and normalized payment-state visibility)
