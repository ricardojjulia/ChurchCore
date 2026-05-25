# Competitive Readiness Roadmap

**Status:** Active planning document  
**Date:** 2026-05-25  
**Related ADR:** [ADR 0004: Competitive Readiness Architecture](../adr/0004-competitive-readiness-architecture.md)  
**Governing plan:** [DEVELOPMENT_PLAN.md](../../DEVELOPMENT_PLAN.md)

## Purpose

This roadmap turns the current competitive-priority list into the next major-release execution plan for ChurchCore Ops. The goal is to make the product credible against Planning Center, Breeze/Tithely, Pushpay/CCB, Realm, and MinistryPlatform by proving end-to-end church operations rather than only showing module breadth.

The release is complete only when a church evaluator can operate the system without knowing the codebase, without relying on preview-only shortcuts, and without asking the team which route to visit next.

## Competitive Goal

ChurchCore Ops should compete as a compliance-first church operating system, not as another lightweight church CRM. The release must prove six outcomes:

1. The weekly church-operator path works end to end.
2. Member mobile workflows are reliable enough for ordinary churchgoers.
3. Communications delivery works with real providers and consent controls.
4. Service planning and event registration close the largest Planning Center gap.
5. Migration tooling lets churches evaluate a move from incumbent platforms.
6. Security, privacy, tenant-boundary, and role-access claims are backed by tests and documentation.

## Release Principles

- Tenant runtime data remains tenant-owned and tenant-scoped.
- Control-plane data remains separate from church operational data.
- Every workflow gets an obvious next action, empty state, error state, and completion state.
- Sensitive operations are auditable, especially children, finances, communications consent, pastoral care, imports, and role changes.
- External providers are reached through adapter boundaries, not scattered SDK calls.
- Imports write to staging first; no vendor import writes directly to production tables without validation and operator confirmation.
- A milestone is not done until docs, tests, role access, and smoke coverage are updated.

## Phase 1: Finish The Operator Path

**Goal:** A church admin can run one realistic church week without codebase knowledge.

### Scope

- Church setup and public profile readiness.
- Account requests, invitations, role assignment, and first sign-in.
- People, households, statuses, duplicate concerns, and member numbers.
- Events, rosters, attendance, and calendar coordination.
- Children's ministry readiness, check-in, checkout, incidents, volunteers, and safety settings.
- Volunteer schedule coverage, conflicts, responses, and next actions.
- Giving exceptions, public giving setup, fund mapping, receipts, and GL posting.
- Finance dashboard, journals, budgets, imports, and reports.
- Communications queue, failed sends, consent gaps, and audience readiness.
- Reports as a daily decision surface, not only a destination page.

### Architecture Work

- Introduce a shared readiness contract for module summaries, blocking issues, recommended actions, route targets, and completion state.
- Keep each module's data loader responsible for its own domain, while the readiness workspace composes summaries.
- Add route-level filtered views where readiness links target a specific class of issue.
- Standardize module empty, loading, unavailable-backend, insufficient-permission, and completed states.

### Acceptance Criteria

- `npm run smoke:local` covers the ChurchAdmin weekly path from sign-in through readiness targets.
- A new evaluator can follow `/app/church-admin/readiness` and resolve or inspect every issue linked there.
- Every target route has a clear title, active navigation state, empty state, and primary next action.
- Role guards prevent Secretary, Pastor, Ministry Leader, Member, and Control Plane users from reaching ChurchAdmin-only workflows.
- `docs/application-guide.md`, `docs/mvp-readiness-audit.md`, and this roadmap reflect the implemented path.

## Phase 2: Harden Mobile Member Workflows

**Goal:** Members can manage their own church relationship from a phone-sized screen.

### Scope

- Giving history, recurring giving management, and tax-statement readiness.
- Profile and contact updates with confirmation states.
- Family and household updates, including pending-review states where admin approval is required.
- Personal schedule, RSVP, volunteer assignments, and group meetings.
- Groups browse, join request, roster visibility, resources, and messaging entry points.
- Opt-in directory browsing and privacy controls.
- Notification preferences for email, SMS, and future push notifications.
- Mobile navigation, safe touch targets, and offline-tolerant fallback where appropriate.

### Architecture Work

- Treat `/app/member/*` as the member mobile surface, even when rendered on desktop.
- Keep member-write actions narrow and church-scoped.
- Use pending-change records for sensitive updates that require admin review rather than letting members overwrite canonical records directly.
- Keep notification preference state consent-aware and append-only where required.

### Acceptance Criteria

- Member routes pass a phone-sized browser sanity check.
- Member can update profile/family information and see whether the change is saved, pending review, or rejected.
- Member can view giving history and schedule without seeing another member's restricted data.
- Member directory visibility honors opt-in and role policies.
- Tests cover self-service access boundaries and pending-review behavior.

## Phase 3: Complete Communications Delivery

**Goal:** Church communications can be sent, tracked, retried, unsubscribed, and audited through real providers.

### Scope

- Provider adapters for email and SMS.
- SendGrid or Resend as the first email provider.
- Twilio as the first SMS provider.
- Audience selection by role, group, tag, event, household state, and custom filters.
- Consent and unsubscribe enforcement before send.
- Delivery queue with scheduled, sending, sent, failed, bounced, suppressed, and cancelled states.
- Webhook ingestion for bounces, delivery updates, replies where supported, and unsubscribe events.
- Operator views for failed sends, consent gaps, invalid contact data, and retry actions.

### Architecture Work

- Route all outbound messages through a communication orchestration service.
- Keep provider-specific logic behind adapters.
- Store normalized delivery events independently from provider payloads.
- Require idempotency keys for provider sends and webhook processing.
- Keep consent checks server-side and auditable.

### Acceptance Criteria

- A communication cannot be sent to a recipient who lacks required consent or has unsubscribed.
- Provider failure and bounce events appear in the Communications operations lane.
- Webhooks are idempotent and covered by tests.
- Operators can retry eligible failures without duplicating successful sends.
- Documentation lists required environment variables, webhook URLs, consent rules, and local testing flow.

## Phase 4: Close Service Planning And Event Registration Gaps

**Goal:** ChurchCore Ops can cover worship/service planning and paid or unpaid event registration.

### Scope

- Service plans with date, service type, schedule blocks, team assignments, and planning notes.
- Volunteer positions, needed counts, assignments, responses, conflicts, and reminders.
- Worship-oriented service elements where needed: songs, readings, sermon metadata, files, and run-of-service order.
- Event registration forms with capacity, waitlist, questions, household registration, and approval states.
- Paid registration through Stripe where payment is required.
- Registration roster, check-in export, refunds/cancellations, and attendance linkage.

### Architecture Work

- Model service plans separately from general calendar events, while allowing them to link to events.
- Reuse volunteer scheduling where possible instead of creating a parallel assignment system.
- Use form definitions plus normalized responses for event registration.
- Keep registration payments connected to donations/finance only when accounting treatment is explicitly defined.

### Acceptance Criteria

- ChurchAdmin can create a service plan, assign volunteers, collect responses, and view coverage gaps.
- ChurchAdmin can create a registration event with custom questions and capacity rules.
- Member/public registrants can submit registration on mobile.
- Paid registrations create auditable payment records and operator-visible reconciliation state.
- Service planning and registration appear in weekly readiness where relevant.

## Phase 5: Add Migration And Import Tooling

**Goal:** A church can evaluate migration from incumbent software without manual database work.

### Scope

- CSV import as the universal baseline.
- Planning Center export mapping for people, households, groups, giving, events, and volunteers where exports are available.
- Breeze/Tithely export mapping for people, tags/groups, giving, events, and attendance where exports are available.
- Pushpay/CCB export mapping for people, groups, giving, forms/events, and attendance where exports are available.
- Import staging, field mapping, validation, duplicate detection, dry run, confirmation, rollback notes, and audit log entries.
- Operator-facing import history with row-level errors and downloadable rejection files.

### Architecture Work

- Build imports around a vendor-neutral staging model.
- Keep vendor parsers isolated from canonical writes.
- Require explicit church-admin confirmation before committing staged records.
- Use reconciliation rules for households, people, donations, groups, and event registrations.
- Treat financial imports as high sensitivity and route them through finance-specific review where needed.

### Acceptance Criteria

- CSV import supports people and households first, then groups, giving, events, and attendance.
- Vendor import docs explain supported export files and known limitations.
- Dry runs show created, updated, skipped, duplicate, and rejected row counts before commit.
- Committed imports are auditable by user, timestamp, source system, source file, and record counts.
- Tests cover parser behavior, duplicate detection, and tenant isolation.

## Phase 6: Prove Security Claims

**Goal:** Security and privacy claims are backed by executable checks, not only design statements.

### Scope

- Role-access matrix for Control Plane, ChurchAdmin, Secretary, Pastor, Ministry Leader, Volunteer, Member, and public users.
- RLS verification for church-scoped tables.
- Sensitive-data tests for children, pastoral care, finances, communications consent, data rights, and imports.
- Cross-boundary checks between control-plane and tenant data.
- Secrets scanning, dependency review, lint, build, unit tests, integration tests, local smoke, and route-level browser checks.
- Documentation evidence for privacy posture, audit logging, consent, and data retention.

### Architecture Work

- Maintain a living access-control matrix in docs and test fixtures.
- Add reusable role-test helpers for server actions, data loaders, and route smoke flows.
- Keep security tests close to the modules they protect, with a summary index in `docs/testing-schema.md`.
- Treat preview mode separately from authenticated local Supabase verification.

### Acceptance Criteria

- Every protected route has a documented allowed-role set and a test or smoke check.
- Sensitive server actions reject unauthorized users and cross-church access.
- Control-plane local smoke is either fully provisioned or explicitly separated from tenant smoke.
- `npm run lint`, `npm run build`, targeted tests, and smoke commands pass before release handoff.
- `docs/security-assessment.md`, `docs/security-mitigation-plan.md`, and `docs/testing-schema.md` are updated with evidence.

## Delivery Order

1. Stabilize the ChurchAdmin weekly readiness path.
2. Add mobile member workflow hardening in parallel with role-access tests.
3. Complete communications provider delivery because it supports events, groups, giving, and follow-up.
4. Build service planning and event registration on top of events, volunteers, communications, and payments.
5. Build migration/import tooling after canonical workflows are stable enough to receive imported records.
6. Run the security proof phase continuously, with a final release audit before launch.

## Release Gates

Each phase must pass these gates before it is called complete:

- Product: the workflow can be completed by following visible UI actions.
- Data: records are tenant-scoped, auditable where sensitive, and covered by RLS where applicable.
- Roles: allowed and denied roles are documented and verified.
- Errors: empty, unavailable-backend, validation, provider failure, and permission states are visible.
- Tests: unit or integration coverage exists for the riskiest logic, and smoke coverage exists for the user path.
- Docs: README, CHANGELOG, application guide, relevant module docs, and this roadmap are updated.

## Documentation Updates Required By Phase

| Phase | Required documentation |
| --- | --- |
| Operator path | `docs/application-guide.md`, `docs/mvp-readiness-audit.md`, `docs/testing-schema.md` |
| Member mobile | `docs/portal-foundation.md`, `docs/application-guide.md`, `docs/plans/spanish-ui-coverage.md` where UI text changes |
| Communications delivery | `docs/application-guide.md`, `docs/security-assessment.md`, provider setup docs under `docs/setup/` |
| Service planning and registration | `docs/working-calendar.md`, `docs/application-guide.md`, `docs/testing-schema.md` |
| Migration/import | New import guide under `docs/setup/`, `docs/security-assessment.md`, `docs/testing-schema.md` |
| Security proof | `docs/security-assessment.md`, `docs/security-mitigation-plan.md`, `docs/testing-schema.md`, README verification notes |

## Open Decisions

- Whether the first email provider should be SendGrid or Resend.
- Whether event registration payments should initially support only card payments or include ACH.
- Whether service planning needs deep worship-file handling in the first competitive release or can begin with schedule, roster, and plan order.
- Whether migration tooling should support direct vendor API imports later, or remain export-file based until after launch.
