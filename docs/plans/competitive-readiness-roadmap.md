# Competitive Readiness Roadmap

**Status:** Active planning document  
**Date:** 2026-05-25  
**Related ADR:** [ADR 0004: Competitive Readiness Architecture](../adr/0004-competitive-readiness-architecture.md)  
**Governing plan:** [DEVELOPMENT_PLAN.md](../../DEVELOPMENT_PLAN.md)

## Purpose

This roadmap turns the current competitive-priority list into the next major-release execution plan for ChurchCore Ops. The goal is to make the product credible against Planning Center, Breeze/Tithely, ChurchTrac, Pushpay/CCB, Realm, and MinistryPlatform by proving end-to-end church operations rather than only showing module breadth.

The release is complete only when a church evaluator can operate the system without knowing the codebase, without relying on preview-only shortcuts, and without asking the team which route to visit next.

## Competitive Goal

ChurchCore Ops should compete as a compliance-first church operating system, not as another lightweight church CRM. The release must prove six outcomes:

1. The weekly church-operator path works end to end.
2. Member mobile workflows are reliable enough for ordinary churchgoers.
3. Communications delivery works with real providers and consent controls.
4. Service planning and event registration close the largest Planning Center gap.
5. Migration tooling lets churches evaluate a move from incumbent platforms.
6. Security, privacy, tenant-boundary, and role-access claims are backed by tests and documentation.

## Competitive Analysis Snapshot

ChurchCore Ops is not broadly competitive today against mature all-in-one church platforms. Planning Center, Breeze/Tithely, ChurchTrac, and Pushpay/CCB are ahead in polish, mobile member experience, provider-backed communications, service planning, event registration, migration support, integrations, and market trust.

ChurchCore Ops still has a credible path because its strongest differentiators are not "more ChMS features." The defensible position is compliance-first operations: child safety, financial integrity, auditability, tenant isolation, role-aware workflows, and ministry operations in one connected system.

### Feature-By-Feature Competitive Position

| Feature area | Current ChurchCore Ops position | Competitor position | Competitive verdict |
| --- | --- | --- | --- |
| People and directory | Built, needs end-to-end polish and import support | Mature in Planning Center, Breeze/Tithely, ChurchTrac, Pushpay/CCB | Almost competitive |
| Households and profiles | Built, needs stronger self-service and approval workflow | Mature | Almost competitive |
| Groups | Built, needs leader/member workflow maturity | Mature | Not yet competitive |
| Giving | Built/scaffolded, needs full provider, recurring, statements, reconciliation | Mature | Not yet competitive |
| Finance and GL | Full internal finance direction with GL, journals, budgets, reports, and giving-to-GL posture | Planning Center lacks full GL; Breeze/Tithely are lighter; Pushpay/CCB varies | Competitive advantage |
| Children's check-in | Strong CCM module with check-in, checkout, incidents, volunteers, emergency views | Mature competitor modules; ChurchTrac emphasizes check-in app, unlimited kiosks, labels, attendance, emergency text, and checkout | Competitive, but mobile web flow needs definition |
| Child safety compliance | Custody, incidents, readiness, two-adult coverage, audit posture | Competitors support check-in, but compliance posture is less central | Potential advantage |
| Events and calendar | Built, needs registration/payment maturity | Mature | Not yet competitive |
| Event registration and payments | Roadmap gap | Mature in Planning Center, Tithely, Pushpay | Not competitive |
| Worship/service planning | Roadmap gap | Planning Center and Pushpay are strong; Breeze/Tithely now include service planning | Not competitive |
| Volunteer scheduling | Built/partial, needs coverage, responses, reminders, and service-plan integration | Mature | Not yet competitive |
| Communications | Built/partial, provider lifecycle incomplete | Mature enough for operational use | Not competitive |
| Member mobile web/PWA | Built/partial, needs phone-first hardening | Planning Center Church Center, Tithely app, ChurchTrac Church Connect, and Pushpay apps are stronger | Not competitive |
| Reporting | Built, needs decision-ready workflows and drilldowns | Mature | Almost competitive |
| Migration/import | Roadmap gap | Incumbents support exports/imports and onboarding | Not competitive |
| Security and tenant isolation | Strong architecture and documentation posture, needs executable proof | Competitors have mature trust and security programs | Potential advantage |
| Ministry workflow intelligence | ShepherdAI concept exists, deterministic-first and guardrailed | Pushpay is moving into insights; others have lighter automation | Possible advantage if tightly scoped |

### Differentiators Worth Building Around

- **Finance plus ministry operations:** connect giving, fund mapping, GL posting, budgets, ministry spend, and reports in one product.
- **Children's ministry safety:** make custody restrictions, pickup verification, two-adult readiness, incidents, volunteer coverage, and audit history first-class.
- **Compliance-first architecture:** use tenant isolation, RLS, audit trails, consent logs, and role-access evidence as product features, not only internal engineering details.
- **Weekly readiness command center:** answer "Can we run this week safely and responsibly?" across people, children, volunteers, giving, finance, events, communications, and reports.
- **Guardrailed workflow intelligence:** use ShepherdAI to surface follow-up gaps, volunteer overload, attendance decline, giving exceptions, and care workflow signals without replacing pastoral judgment.

### Go-To-Market Implication

ChurchCore Ops should not position itself as a cheaper Planning Center clone. The strongest wedge is churches with 100-1,000 average attendance that feel pain around children, finances, volunteer coverage, pastoral follow-up, board accountability, insurance concerns, or fragmented systems.

The competitive message should be:

> Planning Center-style operations plus Breeze-like simplicity plus serious finance, child safety, privacy, and operational readiness.

### Source Baseline For Future Refresh

This analysis should be refreshed before public pricing, sales copy, or launch claims. Current comparison assumptions are based on public product and pricing pages from Planning Center, Breeze/Tithely, ChurchTrac, and Pushpay.

ChurchTrac is a direct comparator for the mobile and check-in portions of this roadmap because its public positioning includes a member portal/app, a check-in app, unlimited kiosks, checkout, attendance, worship planning, accounting add-ons, and data import/support as part of the value story. ChurchCore Ops should treat that as a practical benchmark for small and mid-size churches that want one system rather than a deeply modular stack.

- Planning Center: modular products for People, Groups, Calendar, Registrations, Check-Ins, Services, Music Stand, Church Center, Publishing, and Giving; public pricing is usage-based by product.
- Breeze/Tithely: flat-rate ChMS and All Access positioning, with giving, messaging, groups, service planning, events, check-in, app, and site bundles.
- ChurchTrac: all-in-one positioning with people, giving, website/app/member portal, check-in, groups, registrations, volunteer scheduling, worship planning, automations, optional accounting, optional messaging, data import, and support. ChurchTrac check-in also emphasizes mobile app/kiosk use, security labels, attendance, emergency text, medical notes, checkout, unlimited kiosks, and wireless printing.
- Pushpay/CCB: demo-priced engagement platform with giving, ChMS, groups, events, check-in, attendance, workflows, forms, service planning, apps, and insights.

## Release Principles

- Tenant runtime data remains tenant-owned and tenant-scoped.
- Control-plane data remains separate from church operational data.
- Every workflow gets an obvious next action, empty state, error state, and completion state.
- The initial mobile strategy is a polished mobile web/PWA experience, not native iOS/Android apps. Native apps may be revisited only after the mobile web surface proves regular use.
- Sensitive operations are auditable, especially children, finances, communications consent, pastoral care, imports, and role changes.
- External providers are reached through adapter boundaries, not scattered SDK calls.
- Imports write to staging first; no vendor import writes directly to production tables without validation and operator confirmation.
- A milestone is not done until docs, tests, role access, and smoke coverage are updated.

## Findings-To-Work Plan

These workstreams convert the competitive findings into implementation-ready steps. Each workstream should be broken into GitHub issues before coding starts, with one issue per vertical slice.

### Finding 1: The Operator Path Is The MVP Trust Test

**Problem:** The product has broad module coverage, but evaluators need one clear weekly path that proves the system can run a church office.

**Steps:**

1. Inventory all current ChurchAdmin routes and classify each as setup, people, weekend, children, volunteers, money, communications, or insights.
2. Define a `ReadinessSummary` contract for status, severity, issue count, recommended action, target route, target query, and completion state. **Started:** `lib/readiness-contract.ts` now provides the shared contract and href builder; `lib/church-admin-readiness-data.ts` emits that contract for the current weekly readiness modules.
3. Add or align module loaders so setup, accounts, people, events, children, volunteers, giving, finance, communications, reports, and workflows can each produce readiness summaries. **Implemented:** setup, account requests, people/households, weekend events, children's ministry, volunteer schedules, giving/finance, communications, reports, and suggested workflows now have module-owned readiness builders in `lib/church-admin-readiness-modules.ts`.
4. Update `/app/church-admin/readiness` to use the shared summaries rather than duplicating module-specific rules.
5. Add filtered target views for every readiness issue type.
6. Add empty, no-backend, permission-denied, validation-error, and completed states to every readiness target route.
7. Add route-level smoke coverage for the weekly path. **Started:** `npm run smoke:local` now checks the current readiness target routes after ChurchAdmin sign-in. **Browser coverage added:** `npm run test:e2e:readiness` uses Playwright to sign in through the browser, hydrate the ChurchAdmin church context, and visit the same current readiness target routes.
8. Update `docs/application-guide.md` and `docs/mvp-readiness-audit.md` with the final operator path.

**Done when:** A new evaluator can sign in as ChurchAdmin, open readiness, inspect every issue, follow every target link, and understand the next action without reading source code.

### Finding 2: Member Mobile Is Behind The Market

**Problem:** Competitors have mature member-facing apps, member portals, or app-like experiences. ChurchCore Ops needs the member surface to be phone-first before it can compete, but the first implementation should be a smaller, polished mobile web/PWA version of the product rather than a native app.

**Steps:**

1. Audit `/app/member/*` and `/app/calendar` at phone viewport sizes.
2. Define the mobile web/PWA scope as a smaller member-facing version of ChurchCore Ops, not a full admin UI squeezed onto a phone.
3. Define the member mobile workflow order: home, schedule, groups, directory, giving, family/profile, preferences, data rights, and member check-in where enabled.
4. Add a mobile shell with bottom navigation, short task cards, large touch targets, and no dense admin tables.
5. Add saved, pending-review, rejected, and permission-denied states for member profile and family updates.
6. Harden giving history and recurring giving management with donor-facing confirmation states.
7. Add member schedule cards that combine events, RSVPs, volunteer assignments, and group meetings.
8. Add group join/request status and leader-visible roster behavior.
9. Verify directory opt-in rules and privacy controls.
10. Add member self-check-in support for events or attendance contexts where staff explicitly enables mobile member check-in.
11. Add phone-sized browser checks and role-access tests for member routes.
12. Update `docs/portal-foundation.md` and Spanish UI coverage notes where user-facing text changes.

**Done when:** A member can use the mobile web/PWA surface from a phone to manage profile, family, giving, schedule, groups, directory visibility, notification preferences, and enabled check-in workflows without staff intervention for ordinary updates.

### Finding 2A: Member Check-In Should Be Mobile-Web Capable When Enabled

**Problem:** ChurchTrac and other competitors treat check-in and attendance as mobile-friendly operational workflows. ChurchCore Ops should let members check themselves in from the mobile web version when staff chooses to allow it.

**Steps:**

1. Define which attendance contexts can allow member self-check-in: worship service, class, group, serving assignment, or special event.
2. Add an admin setting per event/service/check-in session for `mobile_member_check_in_enabled`.
3. Add start and end windows so mobile check-in only works during approved time ranges.
4. Add optional location or code constraints if staff wants check-in limited to on-site or announced access.
5. Add member-facing mobile check-in cards that show only eligible people and eligible events for the signed-in member.
6. Write attendance records with source metadata: `mobile_member`, `kiosk`, `staff`, or `import`.
7. Add duplicate-prevention rules so the same person cannot be checked into the same session twice.
8. Add admin review views that distinguish mobile self-check-in from staff/kiosk check-in.
9. Add role and RLS tests ensuring members cannot check in other households unless the church explicitly allows family/household check-in.

**Done when:** Staff can enable mobile member check-in for a specific session, members can check in only during the approved window, and admins can audit who checked in, when, and by what source.

### Finding 2B: Children's Check-In Needs A Day-Enabled Mobile Web Flow

**Problem:** Children's check-in should not be an always-available generic page. It should be a specially formatted, day-specific flow enabled by admin staff for that day's children's ministry service.

**Steps:**

1. Define a `children_check_in_session` concept tied to a children's ministry service date, room set, volunteer coverage state, and enabled/disabled status.
2. Add admin controls to create, preview, enable, pause, and close the day's children's check-in session.
3. Generate a session-scoped parent check-in URL only after staff enables the session.
4. Return a closed/unavailable state when the session is not enabled, outside its time window, paused, or closed.
5. Design the parent mobile page as a purpose-built check-in/out flow: child list, room assignment, allergy/medical/custody warnings where permitted, pickup code or QR, and clear check-in/check-out actions.
6. Require staff-defined room and volunteer readiness checks before the session can be enabled, including two-adult coverage or an explicit override with audit reason.
7. Support both parent self-service and staff-assisted modes from the same session, with source metadata on each check-in/out record.
8. Add checkout verification using pickup code, QR, authorized guardian, or staff override with audit reason.
9. Hide or disable the session URL after close so it cannot be reused for another day.
10. Add emergency roster, incident link, and attendance export scoped to the active session.
11. Add tests for disabled session access, closed session access, cross-household access, custody restrictions, checkout verification, and audit records.

**Done when:** Children's check-in exists only as a staff-enabled session for a specific service day, supports parent mobile check-in and checkout, and preserves child safety, custody, audit, and volunteer-readiness controls.

### Finding 3: Communications Need Real Delivery Infrastructure

**Problem:** Communications are not competitive until email/SMS delivery, consent, unsubscribe, bounces, retries, and audit history work with real providers.

**Steps:**

1. Choose the first email provider by ADR or documented decision: SendGrid for mature event webhooks, or Resend for simpler developer experience.
2. Confirm Twilio as the first SMS provider unless cost, compliance, or local testing constraints require a separate ADR.
3. Define provider adapter interfaces for send, normalize webhook event, verify webhook signature, and classify retry eligibility.
4. Add delivery queue states: draft, scheduled, sending, sent, failed, bounced, suppressed, unsubscribed, cancelled.
5. Enforce consent, unsubscribe, and suppression server-side before enqueueing or sending.
6. Store normalized delivery events separately from raw provider payloads.
7. Add webhook routes with idempotency keys and signature verification.
8. Surface failed, bounced, suppressed, and consent-gap records in the Communications operations lane.
9. Add retry controls for eligible failures.
10. Document provider environment variables, webhook URLs, local testing, consent rules, and operational runbooks.

**Done when:** A church can send segmented email/SMS through real providers, see delivery outcomes, honor unsubscribe/consent rules, and retry failures without duplicate sends.

### Finding 4: Service Planning And Event Registration Are Major Gaps

**Problem:** Planning Center, Pushpay, and Breeze/Tithely cover service planning and registration. ChurchCore Ops cannot replace them without these flows.

**Steps:**

1. Define a service-plan schema separate from general events, with optional event linkage.
2. Add service plan types, schedule blocks, assignments, needed counts, notes, and run-of-service order.
3. Reuse volunteer scheduling for team requests, responses, conflicts, reminders, and coverage gaps.
4. Add basic worship planning fields: songs, readings, sermon metadata, attachments, and assigned leaders.
5. Define event registration form schema with fields, required flags, household registration, capacity, waitlist, approval, and cancellation states.
6. Add registration payment records for paid events and connect them to Stripe and finance reconciliation where appropriate.
7. Build public/member registration pages that work on mobile.
8. Add ChurchAdmin roster, export, payment status, refund/cancel, and attendance-linking views.
9. Add service and registration readiness summaries.
10. Update `docs/working-calendar.md`, `docs/application-guide.md`, and `docs/testing-schema.md`.

**Done when:** A church can plan a service, schedule volunteers, collect responses, publish a registration event, collect free or paid registrations, and review rosters from one workflow.

### Finding 5: Migration Support Will Decide Whether Churches Switch

**Problem:** A church that cannot move data safely will not adopt the platform, even if features are appealing.

**Steps:**

1. Create a vendor-neutral import staging schema for batches, files, rows, parsed records, validation results, duplicate candidates, commit runs, and audit records.
2. Build CSV people and household import first.
3. Add parser modules for Planning Center exports, Breeze/Tithely exports, and Pushpay/CCB exports as source-specific adapters.
4. Add field mapping UI for required, optional, ignored, and custom fields.
5. Add duplicate detection for person, household, email, phone, member number, and external source IDs.
6. Add dry-run summaries for create, update, skip, duplicate, reject, and warning counts.
7. Require ChurchAdmin confirmation before committing staged rows.
8. Add rejection-file download and import history views.
9. Route giving and finance imports through finance-specific review before posting or reporting.
10. Document supported export files, mapping limitations, rollback expectations, and migration checklist.

**Done when:** A church can run a dry import, understand exactly what will change, commit approved records, and audit what came from each source file.

### Finding 6: Security Claims Need Evidence

**Problem:** Compliance-first positioning only matters if the product can prove tenant isolation, role access, consent, and sensitive-data controls.

**Steps:**

1. Create a role-access matrix for Control Plane, ChurchAdmin, Secretary, Pastor, Ministry Leader, Volunteer, Member, and public users.
2. Link every protected route to allowed roles, denied roles, and sensitive data classes.
3. Add reusable test helpers for authenticated roles and cross-church access attempts.
4. Add server-action tests for sensitive writes in children, finance, communications, imports, people, and pastoral/care workflows.
5. Add RLS verification for church-scoped tenant tables.
6. Add control-plane versus tenant boundary smoke checks.
7. Add provider-webhook security tests for signature verification and idempotency.
8. Add secrets scanning, dependency review, lint, build, unit, integration, local smoke, and browser-route checks to the release gate.
9. Update `docs/security-assessment.md`, `docs/security-mitigation-plan.md`, and `docs/testing-schema.md` with evidence instead of assertions.
10. Re-run the full release verification checklist before any public launch claim.

**Done when:** The team can point to tests, docs, and smoke evidence for tenant isolation, role boundaries, child safety data, finances, communications consent, imports, and control-plane separation.

### Finding 7: The Differentiators Need Product Packaging

**Problem:** Unique capabilities are not automatically appealing unless they are visible, understandable, and tied to buyer pain.

**Steps:**

1. Rename or frame the core differentiator as a weekly operational readiness system, not only dashboards.
2. Build demo data and walkthroughs around real pain: unsafe children's room ratio, unresolved custody restriction, unposted giving, missing fund mapping, volunteer coverage gap, lapsed follow-up, bounced communication, and draft journal.
3. Add product copy that explains finance integrity, child safety, privacy, and auditability in church-office language.
4. Create a buyer-facing comparison page or document that compares ChurchCore Ops against Planning Center, Breeze/Tithely, ChurchTrac, and Pushpay without overclaiming.
5. Create a 30-minute evaluation script for pastors, administrators, treasurers, and children's ministry leaders.
6. Track beta feedback by buyer persona and module.
7. Use feedback to decide whether to double down on Growth/Pro churches or narrow further to children-and-finance-heavy churches.

**Done when:** A demo can make the value obvious to a church administrator, treasurer, children's ministry leader, and pastor without explaining the code or database architecture.

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

- Introduce a shared readiness contract for module summaries, blocking issues, recommended actions, route targets, and completion state. The first contract lives in `lib/readiness-contract.ts` and is used by `lib/church-admin-readiness-data.ts`.
- Keep each module's data loader responsible for its own domain, while the readiness workspace composes summaries. The first splits move setup, account request, people/household, weekend event, children's ministry, volunteer schedule, giving/finance, communications, reports, and suggested workflow summary construction into `lib/church-admin-readiness-modules.ts`.
- Add route-level filtered views where readiness links target a specific class of issue.
- Standardize module empty, loading, unavailable-backend, insufficient-permission, and completed states.

### Acceptance Criteria

- `npm run smoke:local` covers the ChurchAdmin weekly path from sign-in through the current readiness targets.
- `npm run test:e2e:readiness` provides browser-level Playwright coverage for the same route-by-route weekly readiness path.
- A new evaluator can follow `/app/church-admin/readiness` and resolve or inspect every issue linked there.
- Every target route has a clear title, active navigation state, empty state, and primary next action.
- Role guards prevent Secretary, Pastor, Ministry Leader, and Member users from reaching ChurchAdmin-only readiness workflows. Control Plane browser coverage remains pending until the separate local control-plane demo is provisioned.
- `docs/application-guide.md`, `docs/mvp-readiness-audit.md`, and this roadmap reflect the implemented path.

## Phase 2: Harden Mobile Member Workflows

**Goal:** Members can manage their own church relationship from a phone-sized screen.

### Scope

- A polished mobile web/PWA surface for the initial mobile presence, intentionally smaller than the full desktop/admin product.
- Giving history, recurring giving management, and tax-statement readiness.
- Profile and contact updates with confirmation states.
- Family and household updates, including pending-review states where admin approval is required.
- Personal schedule, RSVP, volunteer assignments, and group meetings.
- Groups browse, join request, roster visibility, resources, and messaging entry points.
- Opt-in directory browsing and privacy controls.
- Notification preferences for email, SMS, and future push notifications.
- Member self-check-in for enabled events, services, classes, or groups.
- Session-enabled children's ministry check-in and checkout for parents when admin staff enables the day's session.
- Mobile navigation, safe touch targets, and offline-tolerant fallback where appropriate.

### Architecture Work

- Treat `/app/member/*` as the member mobile web/PWA surface, even when rendered on desktop.
- Do not require native app development in this release; the mobile web experience must be polished enough to validate regular member use first.
- Model member check-in and children's check-in as explicit, staff-enabled sessions rather than always-on generic routes.
- Keep member-write actions narrow and church-scoped.
- Use pending-change records for sensitive updates that require admin review rather than letting members overwrite canonical records directly.
- Keep notification preference state consent-aware and append-only where required.

### Acceptance Criteria

- Member routes pass a phone-sized browser sanity check.
- Member can update profile/family information and see whether the change is saved, pending review, or rejected.
- Member can view giving history and schedule without seeing another member's restricted data.
- Member can check in only to sessions where mobile self-check-in is enabled and within the approved window.
- Parent can access children's check-in/out only through an enabled day-specific session, and disabled or closed sessions show a safe unavailable state.
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
