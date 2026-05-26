# ChurchCore Ops Application Guide

This guide explains what ChurchCore Ops does from first entry through day-to-day use. It is written for evaluators, operators, and contributors who need the whole product story before reading implementation details.

## 1. What ChurchCore Ops Is

ChurchCore Ops is a multi-tenant church operations platform. It gives a church one working system for member records, families, ministries, events, giving, communications, volunteer coordination, children's ministry safety, finance, reports, and guarded ministry workflow recommendations.

The application has two separate operating surfaces:

- **Tenant app:** the church-facing product used by church admins, pastors, ministry leaders, volunteers, and members.
- **Control plane:** the ChurchCore Ops staff surface used for tenant oversight, platform operations, onboarding, billing metadata, and support audit workflows.

Those surfaces intentionally have different data boundaries. The control plane manages platform concerns; the tenant app manages church runtime data.

## 2. How To Run It Locally

For a quick product walkthrough without a backend:

```bash
npm ci
npm run dev
```

Open `http://localhost:4200`. The app runs in preview mode with in-memory demo data.

For the full local demo with Supabase, seeded Grace Harbor Church data, and local demo users:

```bash
npm run setup:local
npm run dev
```

The local setup script creates demo credentials in `.demo-credentials.local`. The default demo users are:

| User | Role | Main Surface |
| --- | --- | --- |
| `sarah@churchcoreops.app` | Church Admin | `/app` |
| `olivia@graceharbor.church` | Secretary / Office Admin | `/app/secretary` |
| `david@graceharbor.church` | Member | `/app` |

See `docs/setup/local-supabase.md` for the full tenant backend setup, reset, seed, and smoke-test flow. The control plane has a separate Supabase project and should be provisioned separately when testing platform-staff workflows.

## 3. First Screen And Sign-In

The root page introduces ChurchCore Ops and gives two main entry points:

- **Sign in:** opens the tenant app sign-in flow.
- **Control:** opens the platform control-plane sign-in flow.

After sign-in, the app hydrates the user's session, role, and church context. A church user lands in the tenant app. A platform user can enter the control plane. Tenant routes and control-plane routes do not share the same long-term data model.

## 4. Tenant App Overview

The tenant app is the church's operating workspace. It is role-aware, so each user sees the workflows that match their responsibility.

The application shell and public entry flow now include English / Spanish language selection. The public home page, sign-in page, public portal, shared shell, Daily Desk, member home, member directory, member family detail page, ChurchAdmin navigation, readiness path, dashboard summary cards, main operations lanes, portal account approval queue, church settings page, and people management page are translated surfaces; church-entered content such as member names, notes, event titles, fund names, and pastoral or office records remains in the language entered by the church. The full rollout is tracked in `docs/plans/spanish-ui-coverage.md`.

Primary tenant roles:

| Role | Purpose |
| --- | --- |
| ChurchAdmin | Church setup, people, ministries, events, giving, communications, finance, volunteers, and operations. |
| Secretary / Office Admin | Daily Desk calls, notes, visit scheduling, calendar coordination, and request follow-up. |
| Pastor / Elder | Pastoral visibility, people care, ministry oversight, discernment, and reporting. |
| Ministry Leader | Ministry roster, volunteers, events, and assigned ministry work. |
| Member / Volunteer | Profile, family, directory, giving, calendar, ministries, groups, and schedule. |

All sensitive data is treated as church-scoped tenant data. Actions are expected to enforce least-privilege access and row-level security.

## 5. ChurchAdmin Workflow

ChurchAdmin is the broadest tenant role. A church admin starts at `/app`, where the home dashboard summarizes live tenant state when a backend is configured and falls back to preview data when it is not.

### Home Dashboard

The dashboard shows summary cards for:

- people
- ministries
- events
- giving

It also includes live operations lanes:

- **Care:** pastoral care assignments and aging follow-up.
- **Weekend:** upcoming events needing approval, roster, capacity, waitlist, or near-term attention.
- **Communications:** queued or failed sends, bounced logs, consent gaps, and contact gaps.
- **Giving:** payment exceptions, unsent receipts, GL reconciliation gaps, fund mapping gaps, and public giving page setup.

### Weekly Readiness

Path: `/app/church-admin/readiness`

The readiness workspace is the MVP operating path. It checks whether a church admin can run the week across church setup, portal account requests, people and households, weekend events, children's ministry, volunteer schedule, giving and finance, and suggested ministry workflows. Each item links directly to the workflow that resolves it, and supported routes open in a filtered readiness view.

Readiness items now follow a shared `ReadinessSummary` contract with status, severity, issue count, completion state, recommended action, target route, and target query metadata. Setup, account request, people/household, weekend event, children's ministry, volunteer schedule, giving/finance, and suggested workflow readiness now use module-owned builders, which keeps the weekly operator path consistent as each remaining module starts owning its own readiness summary.

Supported readiness targets now include filtered or context-specific views for people records, events without roster coverage, children's ministry safety checks, volunteer scheduling, giving/finance exceptions, draft finance journals, and suggested workflows.

### Daily Desk

Path: `/app/daily-desk`

The Daily Desk is the daily working surface for church admins, secretaries / office admins, and pastors. It captures and tracks the work that usually happens between larger modules:

- incoming and outgoing calls
- office notes
- scheduled pastoral or administrative visits
- calendar-related items
- follow-up tasks
- routine checkups

Each item can be connected to a church profile, assigned to a staff or pastoral profile, scheduled, given a due time, marked by priority, and moved to done, waiting, or cancelled. The screen also keeps the operator aware of near-term events and open operational signals such as pending account requests, care follow-up, suggested workflows, and roster gaps.

The Secretary / Office Admin role has its own `/app/secretary` portal and can work `/app/daily-desk` plus `/app/calendar`. It does not receive the full ChurchAdmin sidebar or broad admin settings, finance, children, people-management, or readiness permissions.

### Church Setup

Path: `/app/church-admin/settings`

Admins manage church profile data such as legal name, website, contact details, mailing address, and public summary metadata. This is the starting point for making a tenant usable by a real church.

### People And Households

Path: `/app/church-admin/people`

Admins manage member and attendee records, including:

- member profile details
- account status
- portal account requests
- role assignment
- household assignment and household gaps
- active, inactive, visitor, transferred, and baptized states

This area is also where Sprint 2 continues to expand deeper household workflows, invite edge cases, and role-management hardening.

### Account Requests

Path: `/app/church-admin/accounts`

Church admins review portal access requests submitted from `/portal/register`. Approval creates or updates the member profile, activates the account state, links the profile to the invited Supabase auth user when tenant admin auth is configured, records an active member role in `church_memberships`, and sends a Supabase invitation.

The MVP happy path is:

1. A member opens `/portal/register`, selects the church, and submits first name, last name, email, and optional phone.
2. The request appears at `/app/church-admin/accounts` with an existing-member match when the email already belongs to a church profile.
3. A church admin approves the request.
4. The app assigns or preserves a member number, activates the profile, creates the auth invitation, and records active member access.
5. The invited member completes sign-in and lands in the member portal with church-scoped profile data.

### Communications

Path: `/app/communications`

The communications workspace is used for church messaging and operational follow-up. Consent and communication preferences are logged append-only so changes can be audited.

### Giving

Paths: `/app/giving`, `/app/church-admin/giving`

Admins can review donation activity, giving analytics, fund mappings, receipt gaps, and GL posting status. Public giving is available through `/give/[churchSlug]` when a giving page is configured and live.

The readiness link `/app/church-admin/giving?view=exceptions` opens a focused exception view for failed gifts, unposted gifts, unsent receipts, draft journal count, and public giving page status. Mapped unposted gifts can be posted to the general ledger from the readiness view; failed gifts and receipt gaps link to the next review workflow.

### Finance

Path: `/app/church-admin/finance`

The finance module provides internal church bookkeeping:

- chart of accounts
- journal entries
- posting and voiding workflows
- budgets
- imports
- income statement, balance sheet, and budget variance reports

Donation GL auto-posting connects giving records to balanced journal entries when fund mappings exist.

The readiness link `/app/church-admin/finance/journals?view=drafts` filters journal entries to drafts and highlights the action to open each draft for posting or voiding before calling the week ready.

### Ministry Forge

Path: `/app/church-admin/ministry`

Ministry Forge manages ministry health, rosters, designated leaders, track-specific ministry panels, and stewardship metrics. Current ministry tracks include worship, men, women, marriage, missions, outreach, children, youth, young adults, and education.

Specialized panels surface ministry-specific data such as worship songs, mentorship pairs, mission partners, youth milestones, education coverage, children's safety ratios, and outreach zones.

### Children's Ministry

Path: `/app/church-admin/children`

The Children's Church Ministry module handles:

- check-in and checkout
- services
- rooms
- children records
- volunteers
- emergency roster
- incidents
- safety settings

The module is designed around child safety, custody restrictions, pickup verification, emergency workflows, and restricted access to sensitive child data.

The readiness link `/app/church-admin/children/dashboard?view=readiness` opens a focused safety view for active service state, room ratios, two-adult coverage, open incidents, and background-check coverage. It links directly to volunteer assignment, service management, room setup, incident review, and safety settings so each readiness issue has a clear resolution path.

### Events And Attendance

Paths: `/app/church-admin/events`, `/app/church-admin/attendance`, `/app/calendar`

Admins create and manage church events, view categorized calendar data, track rosters, and log service attendance headcounts. The shared calendar is available from the tenant app and supports categorized event visibility.

### Volunteers

Paths: `/app/church-admin/volunteers`, `/app/church-admin/volunteers/schedules`

Volunteer workflows cover scheduling, member responses, hours, conflicts, and coverage needs. The roadmap includes deeper burnout guardrails and rotation suggestions.

### Small Groups

Path: `/app/church-admin/groups`

Admins manage small groups, group leaders, membership requests, meetings, attendance, and resources. Members can browse and request to join open groups.

### Visitors

Path: `/app/church-admin/visitors`

The visitor workflow tracks first-time visitor follow-up stages from first contact through conversion or inactivity.

### Suggested Ministry Workflows

Path: `/app/church-admin/workflows`

ShepherdAI Ops is an Ops-only recommendation foundation. It uses deterministic signals to suggest ministry workflows, explain why a suggestion exists, and let church admins promote, assign, defer, dismiss, complete, or provide feedback.

It is not a chatbot. It does not replace pastoral judgment. AI-assisted content requires human review.

## 6. Member Workflow

Members enter through `/app` and see a member-focused mobile-friendly navigation:

- **Home:** personal church context and next actions.
- **Calendar:** upcoming church events.
- **Directory:** church directory visibility based on permissions.
- **Ministries:** ministry participation and opportunities.
- **Family:** household and family information.
- **Groups:** open small groups and join requests.
- **Schedule:** volunteer and event schedule.

Members can also manage giving, data rights, notification preferences, and communication preferences where those flows are enabled.

## 7. Public Portal Workflow

Public routes support church-facing entry points before a user is fully signed in:

- `/portal`
- `/portal/register`
- `/give/[churchSlug]`

The public portal can resolve a church from the request hostname, so a tenant hostname can route visitors toward the correct church context. Public giving does not expose private tenant data; it displays only live public giving-page configuration.

## 8. Pastor, Elder, And Ministry Leader Workflow

Pastors, elders, and ministry leaders have narrower operational views than ChurchAdmin. Their surfaces focus on:

- people and pastoral awareness
- assigned ministry leadership
- ministry rosters and events
- discernment and reporting workflows
- care follow-up where permitted

The current implementation continues to expand these role-specific paths as the tenant data model matures.

## 9. Control Plane Workflow

Path: `/control`

The control plane is for ChurchCore Ops platform staff, not church staff. It supports platform-level oversight such as:

- tenant registry
- onboarding state
- billing metadata
- platform staff identity
- tenant-view audit trails
- support and operational review

The control plane has its own Supabase project directory under `supabase/control-plane/`. Control-plane data should not be mixed into tenant runtime tables.

## 10. Data And Security Model

ChurchCore Ops treats member information, donations, pastoral notes, prayer journals, children's safety records, care records, volunteer feedback, and account access as sensitive data.

Core expectations:

- church-scoped data access
- row-level security
- explicit role checks
- append-only audit records for sensitive actions
- explicit consent for communications, tracking, and AI-assisted features
- separate control-plane and tenant backends
- no shared fallback database path between control-plane and tenant surfaces

Children's safety data and pastoral/care-related data require especially tight access boundaries.

## 11. Reporting And Operations

The product includes reporting surfaces for members, events, giving, ministries, communications, outreach, finance, and operational health. These reports are intended to support stewardship decisions, not replace human discernment.

Current reporting and dashboard work includes:

- admin dashboard cards
- operations lanes
- giving and finance reports
- Ministry Forge stewardship metrics
- event and attendance reporting
- ShepherdAI workflow signal explanations

## 12. What Is Still In Progress

The active plan is Sprint 2: Admin Dashboard and Church Setup.

Current next areas:

- deeper church settings/profile management
- invite and account-request edge cases
- deeper household workflows
- broader role-management hardening
- more live admin dashboard summaries
- more write-action and ownership-check coverage
- continued parity between local SQL fallback and Supabase relation reads

The authoritative roadmap remains `DEVELOPMENT_PLAN.md`.

## 13. Where To Read Next

| Need | Document |
| --- | --- |
| Roadmap and release discipline | `DEVELOPMENT_PLAN.md` |
| Local backend setup | `docs/setup/local-supabase.md` |
| Control-plane architecture | `docs/control-plane.md` |
| Tenant/control split ADR | `docs/adr/0002-control-plane-and-tenant-separation.md` |
| Church admin people details | `docs/church-admin-people.md` |
| Working calendar details | `docs/working-calendar.md` |
| ShepherdAI architecture | `docs/shepherd-ai-ops.md` |
| Testing map | `docs/testing-schema.md` |
| Current todo | `docs/todo.md` |
