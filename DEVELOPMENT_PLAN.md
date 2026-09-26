# ChurchCore Development Plan

**Living Document** - Last Updated: September 26, 2026
**Version**: 2.2
**Purpose**: This is the single source of truth for all ChurchCore development. Every GitHub Issue, PR, sprint, and code review must reference this document. Update only via PR.

Visual companion: [docs/development-plan-visual.md](docs/development-plan-visual.md) summarizes the strategy, roadmap, boundary model, and Sprint 1 flow as diagrams. This document remains the source of truth.

## Table of Contents

- [0. MVP Roadmap to October 30, 2026 (tracker)](#0-mvp-roadmap-to-october-30-2026-tracker) — **start here: all open work and its status**
- [1. Project Vision & Scope](#1-project-vision--scope)
- [2. User Roles & Portals](#2-user-roles--portals)
- [3. Core Features](#3-core-features)
- [4. AI Ministry Tools Suite](#4-ai-ministry-tools-suite)
- [5. Events, Calendar & Volunteer Management](#5-events-calendar--volunteer-management)
- [6. Technology Stack](#6-technology-stack)
- [7. Security, Privacy & Compliance](#7-security-privacy--compliance)
- [8. Sprint Roadmap](#8-sprint-roadmap) (historical)
- [9. Detailed Sprint 1 - Foundation & Member Portal](#9-detailed-sprint-1---foundation--member-portal)
- [10. SDLC & Development Processes](#10-sdlc--development-processes)
- [11. GitHub Discipline & Code Quality](#11-github-discipline--code-quality)
- [12. How to Use This Plan](#12-how-to-use-this-plan)
- [Current Status and History](#current-status-and-history)

## 0. MVP Roadmap to October 30, 2026 (tracker)

**This section is the single place for what's left before MVP, and it is the tracker.** Everything open is either a row in the tracker below or listed under "Deferred to after MVP". Nothing lives only in a Council write-up, the history further down, or chat. The owner set it on 2026-09-26.

### 0.1 Target and rules

- **MVP finish date: Friday, October 30, 2026.**
- **MVP means:**
  - all five competitive gaps meet their definition of done (in §0.3);
  - the production-safety track (the `S` rows) is complete;
  - the release checklist (§0.6) passes.
- **The five competitive gaps**, ranked against Planning Center Online, Breeze ChMS and Tithe.ly (Council Review 9, re-verified in code 2026-09-25):
  1. Service planning depth: setlists, song library, volunteer-role matching and rotation.
  2. A phone-first member experience and a check-in kiosk.
  3. Recurring giving and donor statements.
  4. Migration from incumbents, with reconciliation.
  5. Provider breadth: Resend, and accounting export.
- **Retired gates.** The former Phase A–D gates are retired as MVP criteria. So is their blocker ("a church onboards uncoached" plus "a real-export migration dry-run"). Migration is validated against the incumbents' published export formats, not a partner church's data.
- **Current MVP readiness: 70/100** (Council Review 19, 2026-09-26). R1 re-baselines it at MVP.
- **Beta testers are welcome and never gate progress.**
  - Their feedback becomes a tracker row (ID `B-n`) and is ranked like any other work.
  - It is never a precondition for starting or finishing anything.
  - Real-church usage is not an MVP criterion (decision 2026-09-26).
- **The quality bar doesn't move for the date.**
  - Every change ships its tests (`AGENTS.md`, `docs/testing.md`).
  - CI stays blocking.
  - The Council runs before every non-trivial merge.
  - Scope is cut to meet the date; quality never is.
- **Work order:** top to bottom within each week. The safety rows in a week land before that week's feature rows. S2 (webhooks fail closed, with F4) lands before G5.1 (Resend, F2), as the comms follow-ups require.
- **Estimates** are in factory days: one story through build, tests, Council review and merge. They are calibrated on Service Planning Stories 1–3, which took about 1–2 days each, Council included.
  - Must rows: 25 rows, 29.5 factory days, about 5.9 a week.
  - Stretch rows: 4 rows, 4.5 factory days.
  - Available: 25 working days (September 28 – October 30).
  - **The Must work is about 20% over nominal capacity.** The plan relies on two things: the calibrated pace (smaller rows often finish in under their estimate) and the cut line (§0.4). This is the plan's main risk, and it's checked at every milestone.

**Progress (update on every merge):** 0 of 25 Must rows done · 0 of 4 Stretch rows done · next milestone **M1, Friday October 2** · last updated 2026-09-26.

### 0.2 Milestones

| Milestone | Date | Exit criteria |
|---|---|---|
| **M0** | Mon Sep 28 | CI checks marked required on `main` (O1). Roadmap merged. |
| **M1** | Fri Oct 2 | **Gap 1 (service planning) closed.** |
| **M2** | Fri Oct 9 | **Production-safety track complete except `/hq`** (S1–S4, S6). Members can create, change and cancel recurring gifts (G3.1). |
| **M3** | Fri Oct 16 | **Gap 3 (recurring giving and statements) closed.** `/hq` tenancy fixed (S5), so the safety track is complete. Resend live (G5.1). Giving, finance and comms untested exports at zero (T1a). |
| **M4** | Fri Oct 23 | **Gaps 2 (phone-first and kiosk) and 4 (migration) closed.** |
| **M5** | Fri Oct 30 | **Gap 5 closed.** Whole-app Council re-baseline passes. Release checklist passes. **MVP released.** |

### 0.3 Tracker

Status values: `Not started`, `In progress`, `Done (#PR)`, `Deferred (reason)`. Priority `Must` rows are MVP. `Stretch` rows fall under the cut line (§0.4).

#### Owner actions

| ID | Item | Due | Definition of done | Status |
|---|---|---|---|---|
| O1 | Mark CI checks required | Sep 28 | In GitHub branch protection for `main`, `verify` and `e2e (shard 1/4)`–`e2e (shard 4/4)` are required status checks. Checked 2026-09-26: none are required yet, so CI failures don't block merges. | Not started |

#### Week 1 (Sep 28 – Oct 2), milestone M1: close gap 1 (6 must days)

| ID | Priority | Item | Est. | Definition of done | Status |
|---|---|---|---|---|---|
| G1.4 | Must | Blockout dates (FS3-1) | 1.5 | A volunteer adds and removes unavailable dates from `/app/member/schedule`. An admin adds and removes them from the volunteer directory. The planner's "Unavailable that day" and the assign modal honor them. Unit, action, DB and journey tests. | Not started |
| G1.5 | Must | Assignment notifications (FS3-2) | 1.5 | Assigning a volunteer, whether by hand or by auto-fill, sends an email (or SMS, if that's their preference) with the accept/decline link, through the existing communications pipeline, with consent and suppression respected. A decline shows the admin the top replacement suggestions. Tests, including the journey: assign → volunteer declines → admin sees replacements. | Not started |
| G1.6 | Must | Church-timezone days (FS3-4) | 0.5 | Same-day conflicts, blockout dates, 30-day load and month counts use `churches.timezone`, not UTC. Test: an evening service in UTC−4 is on the right day. | Not started |
| G1.7 | Must | Rehearsal scheduling (Story 4) | 1.5 | A plan can have one or more rehearsals (date, time, location, which positions attend). Assigned volunteers see them on their schedule and in the calendar. Assignment notifications include them. Journey test. | Not started |
| G1.8 | Must | A service plan requires its event (Story 5) | 1 | A migration backfills an event for every plan without one, then makes `service_plans.event_id` NOT NULL. Creating a plan creates or links its event. `volunteer_shifts.event_id` is always set. DB and journey tests. | Not started |
| G1.9 | Stretch | Transactional assign (FS3-3) | 0.5 | An `assign_volunteer_shift` RPC does the conflict, capacity and insert in one transaction. Two concurrent applies can't double-book a volunteer or over-fill a position (DB test). | Not started |

**Gap 1 definition of done:** G1.4–G1.8 are done, and the service-planning journeys pass in CI: build a plan, add songs, assign by hand, auto-fill, notify, accept or decline, rehearsal.

#### Week 2 (Oct 5 – Oct 9), milestone M2: safety track and recurring gifts (5.5 must days)

| ID | Priority | Item | Est. | Definition of done | Status |
|---|---|---|---|---|---|
| S1 | Must | Communication-log access alignment (F7) | 1 | `communication_logs` RLS matches the page gates: a secretary can read what their pages show, and a ministry leader can no longer read logs the app denies them. A pure church-admin e2e fixture, so the sweep no longer passes through the platform-admin RLS bypass. DB tests for each role. | Not started |
| S2 | Must | Webhooks fail closed (with F4) | 1 | All four delivery and payment webhooks (Stripe, SendGrid, Twilio, Resend) reject requests when their signing secret is unset, in every environment. Stripe enforces a replay window. The F4 webhook log lookup is verified: suppressions from bounces and STOPs are actually written. Route tests for each. | Not started |
| S3 | Must | `/api/reports/custom` | 0.5 | `requireChurchSession` sits outside the `try`, so a signed-out user is redirected, not shown an error. The `queryTenantLocalDb` read is replaced with an RLS-respecting client. Tests. | Not started |
| S4 | Must | Crons and demo routes fail closed (F8) | 0.5 | Cron routes reject requests without a valid `CRON_SECRET` outside local development. Demo-only routes return 403 when demo mode is off. Tests. | Not started |
| S6 | Must | Server-side broadcast recipients (F6) | 0.5 | `broadcastMessageAction` resolves recipients from ids on the server and ignores client-supplied contact details. Tests. | Not started |
| G3.1 | Must | Recurring gift creation | 2 | A member creates a recurring gift (amount, fund, weekly/biweekly/monthly, start date) as a Stripe subscription. They can change the amount, fund or frequency, pause, and cancel from `/app/member/giving`. An admin sees and manages recurring gifts. `lib/stripe/*` gets tests. Journey test. | Not started |

#### Week 3 (Oct 12 – Oct 16), milestone M3: close gap 3 (6.5 must days)

| ID | Priority | Item | Est. | Definition of done | Status |
|---|---|---|---|---|---|
| S5 | Must | `/hq` role source and tenancy | 1 | `/hq` authorizes from membership roles, like the rest of the app. The `hq_*` tables gain `church_id` with RLS. The profile-role drift found at Council Review 18 is traced and fixed. Tests. | Not started |
| G3.2 | Must | Installments from Stripe webhooks | 1.5 | `invoice.paid`, `invoice.payment_failed` and `customer.subscription.updated` record each installment as a donation, send its receipt, and post it to the ledger through the existing finance posting. A failed payment notifies the donor. Webhook and finance tests. | Not started |
| G3.3 | Must | Year-end giving statements | 2 | An admin generates per-donor statements for a date range (default: last calendar year): a PDF with the church header, gifts and the tax-deductibility wording. Batch email to donors, with consent respected. Members download their own from `/app/member/giving`. Tests and a journey. | Not started |
| G5.1 | Must | Resend live and provider error codes (F2) | 1 | Resend is the email provider per ADR 0006, with SendGrid as the fallback. Both providers' HTTP statuses and errors map to the retry cron's transient codes. Adapter and cron tests. | Not started |
| T1a | Must | Untested exports: giving, finance, comms | 1 | Zero `untestedExports` waivers in the giving, finance and communications action modules. | Not started |
| G3.4 | Stretch | Pledges and campaigns | 1.5 | An admin creates a campaign (goal, dates, fund). A member pledges. Progress comes from actual gifts, and members see their own pledge progress. Tests. | Not started |

**Gap 3 definition of done:** G3.1–G3.3 are done. Giving journeys pass in CI: one-time gift, recurring create, change and cancel, installment recorded and receipted, statement generated. Pledges (G3.4) are a stretch; if they're cut, they are recorded as deferred, not silently dropped.

#### Week 4 (Oct 19 – Oct 23), milestone M4: close gaps 2 and 4 (5.5 must days)

| ID | Priority | Item | Est. | Definition of done | Status |
|---|---|---|---|---|---|
| G2.1 | Must | Phone-first member flows | 1.5 | At 390×844, member home, schedule, giving and family meet all of these: 44px touch targets, no horizontal scroll, a single-column layout, primary actions within thumb reach. Includes the service-plan `SimpleGrid cols={3}` breakpoint, the missing calendar heading, the member-home timezone date glitch, and `RoleTypeManager` aria-labels. Mobile e2e checks at 390×844 assert all of the above. | Not started |
| G2.2 | Must | Kiosk self check-in | 1.5 | A kiosk mode for children's check-in: large targets, family lookup by phone number or a check-in code, QR code entry, and an attended mode that locks navigation and times out to the start screen. Journey test at tablet size. | Not started |
| G2.3 | Stretch | Offline member schedule | 1 | The service worker caches the member's schedule, with an "offline, last updated …" banner. Tested offline in e2e. | Not started |
| G4.1 | Must | Published-format fixtures in CI | 1 | Fixtures that match Planning Center's and Breeze's published export formats for people, giving, attendance, groups and events. Each import adapter is tested against them in CI. | Not started |
| G4.2 | Must | Post-import reconciliation | 1.5 | After every import, a report compares counts and giving totals per entity against the source file, lists mismatched and skipped rows with reasons, and can be downloaded. Tests and a journey: import fixture → reconciliation shows zero mismatches. | Not started |
| G4.3 | Stretch | Guided migration flow | 1.5 | One ordered flow (people → groups → events → attendance → giving) with progress and resume, reusing the existing importers. Journey test. | Not started |

**Gap 2 definition of done:** G2.1 and G2.2 are done, and the mobile and kiosk journeys pass in CI.
**Gap 4 definition of done:** G4.1 and G4.2 are done, and the migration journey passes in CI.

#### Week 5 (Oct 26 – Oct 30), milestone M5: close gap 5 and release (6 must days)

| ID | Priority | Item | Est. | Definition of done | Status |
|---|---|---|---|---|---|
| G5.2 | Must | Accounting export | 1.5 | General-ledger export for a date range: QuickBooks-importable (IIF) and Xero-importable (CSV), with account mapping from the chart of accounts. Round-trip tests against the formats. | Not started |
| T1b | Must | Untested exports: child safety, pastoral | 1 | Zero `untestedExports` waivers in the children's ministry and pastoral/elders action modules. | Not started |
| T2 | Must | Journeys for the remaining core workflows | 1.5 | End-to-end journeys in CI for child check-in and check-out (with authorized pickup), pastoral care notes, and people and households. | Not started |
| R1 | Must | Whole-app Council re-baseline | 1.5 | A full four-agent Council review, not diff-scoped. Every competitive gap is judged closed against its definition of done. No open Critical or High finding. Module percentages are re-scored (the last whole-app audit was Review 12). Findings are fixed or recorded as `B-`/deferred rows. | Not started |
| R2 | Must | MVP release | 0.5 | Every item in the release checklist (§0.6) passes. A version bump, CHANGELOG release section and git tag. README and this plan state "MVP released 2026-10-30" with the re-baselined score. | Not started |

**Gap 5 definition of done:** G5.1 and G5.2 are done.

#### Beta feedback

| ID | Priority | Item | Est. | Definition of done | Status |
|---|---|---|---|---|---|
| — | — | *(none yet)* | | | |

### 0.4 Cut line

On each milestone date, compare the Must rows due by then against their status.
- **More than two factory days behind:** Stretch rows move to "Deferred to after MVP", in this order:
  1. G3.4 pledges
  2. G4.3 guided migration flow
  3. G2.3 offline schedule
  4. G1.9 transactional assign
- **Still behind after that:** the owner decides whether to move the date or cut a Must row. That decision is recorded here with its date.
- **Must rows are never silently dropped.**

### 0.5 Deferred to after MVP

Each item was triaged on 2026-09-26 from the Council reviews and the plan history. Each is deliberately out of MVP scope.

| Item | Source | Why it's after MVP |
|---|---|---|
| Multi-week auto-scheduling, household "schedule with", volunteer-set preferred frequency (FS3-6) | Review 19 | Competitive long tail. The planner is complete without them. |
| Share the burnout rule between `lib/burnout-calculator.ts` and the planner (FS3-5) | Review 19 | Duplicated constant. Behavior is already consistent, with the pool check the stricter one. |
| DLQ visibility: Sentry reporting, a failure count in the cron response, a DLQ view (F3) | Reviews 16–17 | Operational visibility. Failures are already recorded in `communication_dlq`. |
| Native-speaker review of the `es`/`es-PR` catalogs, and i18n coverage for unwired modules | Localization review, 2026-09-18 | Not one of the five competitive gaps. New MVP screens in already-localized modules still ship their strings. |
| A centralized skill catalog and governance table | Review 15 | Free-text skills work for matching. |
| Nested route-segment `error.tsx` / `loading.tsx` below `app/app`, `app/portal` and `app/control` | Reviews 12–13 | The root boundaries and skeletons already exist. |
| CI build-once artifact; hosted-preview super-admin verification | Review 18 | CI speed and preview tooling, not product behavior. |
| Workflow integrations (Zapier-style) and native mobile apps | Competitive gap 5 and gap 2 scope | Explicitly post-MVP in the gap definitions. |
| Untested exports outside giving, finance, comms, child safety and pastoral | Review 18 (62 waivers) | The waiver list can only shrink (`test:surfaces`). MVP clears the risk-heavy modules (T1a, T1b), and the rest burns down after. |

Closed on 2026-09-26 by a code check, so no row is needed:
- the `/app/member` 404 risk (Review 11): it is served by `/app/[role]`;
- `audit_log` missing `church_id` and `actor_role` (Review 10): both columns exist.

### 0.6 MVP release checklist (R2)

- [ ] Every Must row in §0.3 is `Done`, and every Stretch row is `Done` or `Deferred` with its reason.
- [ ] Each gap's definition of done is met, confirmed by the R1 whole-app Council, with no open Critical or High finding.
- [ ] CI is green on `main`: `verify` (lint, typecheck, unit, `test:surfaces`, RLS audit, `test:db`) and all e2e shards, **as required checks** (O1).
- [ ] `npm run build` passes, `npm run lint:migrations` passes, and every migration applies cleanly to a fresh database.
- [ ] Safety track S1–S6 is done, and `RELEASE_CHECKLIST.md` passes.
- [ ] Every commit on `main` shows as verified.
- [ ] CHANGELOG release section, version bump and tag. README and this plan updated with the release and the re-baselined MVP score.

### 0.7 How this is tracked

- **On every merge:** the Documenter (Council step 7, in `.claude`, `.codex` and `.gemini`) sets the row's status to `Done (#PR)` and updates the progress line in §0.1. A PR for a tracked item names its ID in the title, e.g. `feat: blockout dates (G1.4)`.
- **On every milestone date:** compare against §0.2 and apply the cut line (§0.4). Record the result as a dated line under the milestone table.
- **New work:** beta feedback, Council findings and discovered bugs become rows (`B-n` for beta feedback, or the next ID in their gap or track). Anything not made a row goes into §0.5 with a reason. No open item lives only in chat or in a review document.
- **The history below (§ Current Status and History)** records what shipped and why. It is not where open work is tracked.

## 1. Project Vision & Scope

Build a secure, multi-tenant SaaS platform for churches called **ChurchCore**.

Product family context:
- **ChurchCore**: church operations platform (this plan and repository)
- **ChurchCore Care**: Christian counseling product
- **ChurchCore Academy**: Christian LMS and administration product

- Empower churches with tools for administration, donations, ministries, leadership, spiritual formation, events, and volunteer coordination.
- Key differentiators: role-based portals, user data ownership, strict PII and PHI handling, an intelligent categorized calendar, and AI-assisted tools with strong theological guardrails.
- Business model: subscription tiers with usage-based add-ons such as payments processing and AI credits.
- Architectural rule: the ChurchCore control plane and the tenant-facing church application are separate products with separate data boundaries.

## 2. User Roles & Portals (RBAC)

- **SuperAdmin**: Platform-wide management.
- **ChurchAdmin**: Full church settings, users, donations.
- **Secretary / Office Admin**: Daily Desk, calls, notes, visit scheduling, calendar coordination, and office follow-up without full church-admin access.
- **Pastor / Elder**: Leadership tools, sermon oversight.
- **MinistryAdmin / Leader**: Ministry tracking and volunteers.
- **Volunteer / Member**: Self-service portal for profile, giving, calendar, RSVPs, and ministries.

All pages and APIs enforce least-privilege RBAC.

Platform and tenant boundaries are also explicit:

- **Control Plane**: ChurchCore staff only
- **Tenant App**: Church users only

The two surfaces may share design systems and selected libraries, but they do not share a long-term runtime data model.

## 3. Core Features

- Member directory with families and attendance.
- Ministry membership and leadership assignment.
- Specialized ministry pathways for men, women, children, youth, young adults, marriage, education, missions, and outreach.
- Pastoral and minister profiles with fully customizable titles.
- Donation management with Stripe.
- Graphical multi-surface reporting and dashboards across members, events, giving, ministries, communications, and outreach.
- Communications across email and SMS.

## 4. AI Ministry Tools Suite

AI acts as an assistive tool only for research, brainstorming, and organization with strong theological guardrails. It never replaces prayer, Scripture study, or human discernment. All AI interactions are server-side, consent-aware, and audit logged.

- **Sermon Planning**: Idea and title brainstorming, outline generation, illustration suggestions, series planning, and calendar linkage.
- **Bible Study**: Conversational Q&A, passage analysis, personalized plans, small-group tools, and Scripture integration.
- **Prayer Journaling**: Guided entries, prompts, optional theme detection, answered prayer tracking, and Scripture links.
- **Daily Prayer Send-outs**: AI-assisted content with human approval, scheduling, and delivery through email, SMS, or in-app channels.
- **Weekly Bible Studies**: Auto-generated guides, discussion questions, leader and participant versions, and calendar integration.

Shared AI requirements:

- Prompt library with theological guardrails.
- Reliable Bible APIs using public-domain or licensed content.
- Retrieval and grounding for generated outputs.
- Disclaimers on all outputs.

Implementation starts in later sprints.

## 5. Events, Calendar & Volunteer Management

- Categorized calendar with categories such as General, Informational, Administrative, Ministry, Internal, Liturgical, Prayer, Outreach, Worship, and others as needed.
- FullCalendar with multiple views and powerful filters.
- RSVP system and volunteer shift management.
- Working-calendar support for Month, Week, Day, Agenda, and resource-aware views.
- Burnout guardrails including load warnings, rotation suggestions, and rest prompts.
- Specialized ministry stewardship metrics including vitality scoring, discipleship velocity, and children-serving safety monitoring.
- Real-time updates, conflict detection, and integrations with future AI support flows.

## 6. Technology Stack

- **Frontend**: Next.js 15 or newer with App Router, TypeScript, Tailwind CSS, Mantine UI, and calendar tooling integrated into the Mantine-based application shell.
- **Backend/Database**:
  - Control plane backend and database for platform concerns
  - Tenant backend and database for church runtime concerns
  - Supabase remains acceptable for these layers, but the repo must no longer assume a single combined control-plane-plus-tenant database
- **Payments**: Stripe.
- **Notifications**: Twilio, SendGrid, or equivalent in later phases.
- **Hosting**: Vercel plus Supabase.
- **AI**: Private LLM endpoints in later sprints.

## 7. Security, Privacy & Compliance

- **PII and PHI Guidelines**: Classify member information, donations, pastoral notes, prayer journals, volunteer feedback, and any care-related records as sensitive. Enforce data minimization, encryption at rest and in transit, UI masking, and row-level security in the database.
- **High-Sensitivity Ministry Data**: Treat children's safety records, pickup data, marriage-care notes, pastoral review records, and mentorship access logs as higher-sensitivity slices requiring tighter RLS and field-level protection where needed.
- **User Data Ownership**: Provide self-service export and delete aligned to GDPR and CCPA-style expectations. Church admins may honor individual requests with logged overrides when permitted.
- **Consent & Auditing**: Require explicit consent for AI, communications, and tracking. Maintain full audit logs for sensitive access and role-sensitive actions.
- **AppSec**: Run SAST, SCA, DAST, dependency scanning, secrets scanning, and OWASP Top 10 verification on every PR. Require manual review for PII, payment, or AI changes.
- **Boundary Security**: Control-plane data and tenant operational data must live in separate databases. Cross-boundary support access must be explicit, auditable, and intentionally designed rather than implemented through shared tables.
- Non-production environments must use anonymized or safe development data. Regular penetration testing remains required before launch.

## 8. Sprint Roadmap

> **Historical.** This was the original sprint plan. Most of its scope shipped under different names through the Council process. Open work and dates are in [§0](#0-mvp-roadmap-to-october-30-2026-tracker).

| Sprint | Focus | Goal | Estimated Duration |
| --- | --- | --- | --- |
| 1 | Foundation & Member Portal | Working auth, members, ministries, pastoral profiles, categorized calendar | 2 weeks |
| 2 | Admin Dashboard & Church Setup | Full admin tools, church settings, directory | 2 weeks |
| 3 | Events & Volunteer Management | Advanced calendar, RSVPs, volunteer tools | 2 weeks |
| 4 | Donations, Reporting & Financial Management | Stripe integration, dashboards, double-entry accounting, budgets, import | 3 weeks |
| 5 | AI Ministry Tools (Phase 1) | Sermon planner, Bible study assistant | 3 weeks |
| 6 | Communications & Polish | Notifications, mobile responsiveness | 2 weeks |
| 7+ | Advanced features, payment tiers, launch | Final polish and production launch | Ongoing |

## 9. Detailed Sprint 1 - Foundation & Member Portal

**Sprint Goal**: Deliver a functional core that churches can begin using immediately.

### 9.1 Sprint 1 Deliverables

- Working authentication on Supabase.
- Member portal foundation with church-scoped profile records.
- Ministry creation plus member-to-ministry assignment.
- Pastoral and minister profile titles as customizable display fields.
- Categorized calendar foundation inside the Mantine-based application shell.
- Baseline RLS across Sprint 1 tables.
- A documented migration path away from the current shared data-plane assumption and toward separate control-plane and tenant databases.

### 9.2 Database Schema (Supabase)

```sql
-- Churches (Tenants)
create table public.churches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  created_at timestamptz default now()
);

-- Profiles
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  church_id uuid references churches not null,
  full_name text not null,
  email text,
  phone text,
  address text,
  avatar_url text,
  role text check (role in ('church_admin', 'secretary', 'pastor_elder', 'ministry_leader', 'member_volunteer')) not null default 'member_volunteer',
  display_title text,
  is_pastoral boolean default false,
  created_at timestamptz default now()
);

-- Ministries
create table public.ministries (
  id uuid primary key default gen_random_uuid(),
  church_id uuid references churches not null,
  name text not null,
  description text,
  leader_profile_id uuid references profiles(id),
  created_at timestamptz default now()
);

-- Profile ↔ Ministry junction
create table public.profile_ministries (
  profile_id uuid references profiles(id) on delete cascade,
  ministry_id uuid references ministries(id) on delete cascade,
  primary key (profile_id, ministry_id)
);

-- Events
create table public.events (
  id uuid primary key default gen_random_uuid(),
  church_id uuid references churches not null,
  title text not null,
  description text,
  start timestamptz not null,
  "end" timestamptz not null,
  category text check (category in ('general', 'informational', 'administrative', 'ministry', 'internal', 'liturgical', 'prayer', 'outreach', 'worship')) not null default 'general',
  ministry_id uuid references ministries(id),
  visibility text check (visibility in ('public', 'members', 'leaders')) default 'members',
  rsvp_enabled boolean default true,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

-- Enable RLS on all tables
alter table churches enable row level security;
alter table profiles enable row level security;
alter table ministries enable row level security;
alter table profile_ministries enable row level security;
alter table events enable row level security;
```

### 9.3 Sprint 1 Execution Order

1. Finish aligning the repo to the approved frontend direction for Sprint 1.
2. Freeze further architectural drift into the shared control-plane-plus-tenant database model.
3. Document and approve the control-plane versus tenant separation architecture.
4. Normalize the tenant schema around `churches`, `profiles`, `ministries`, `profile_ministries`, and `events`.
5. Wire church-scoped profile hydration after sign-in.
6. Build the member portal foundation on real tenant data.
7. Build ministry assignment flows.
8. Replace preview calendar state with categorized event records.

### 9.4 Sprint 1 Exit Criteria

- A signed-in church user lands in a real church-scoped app context.
- Profiles load from Supabase instead of preview role data.
- Ministries can be created and assigned within a church boundary.
- Events load with category support and basic calendar views.
- RLS blocks cross-church reads and writes.
- The repo no longer treats one shared control-plane-plus-tenant database as the target architecture.

## 10. SDLC & Development Processes

Agile with two-week sprints. Every code change follows:

1. Issue creation with bug or feature labels.
2. Design, including an ADR for major decisions.
3. Implementation on a feature branch.
4. Documentation covering what changed, why, PII impact, screenshots, testing notes, and ethical notes for AI or spiritual features.
5. Testing across unit, integration, manual, and security paths.
6. Review and verification.
7. Deployment through CI/CD.

**Versioning (SemVer)**:

- **MAJOR**: Breaking changes, major new modules, or significant PII or AI updates.
- **MINOR**: New features and enhancements.
- **PATCH**: Bug fixes and minor revisions.

Track delivery through GitHub Issues and Projects, `CHANGELOG.md`, and Releases. Major changes require stakeholder review.

## 11. GitHub Discipline & Code Quality

- **Branching**: GitHub Flow with `main` protected and feature or bugfix branches created from `main`.
- **PR Process**: Mandatory template including issue link, checklist for tests, docs, PII, security, ethical notes, and screenshots. Conventional commits. Minimum one to two approvals.
- **Checks**: ESLint and Prettier, tests, static analysis, dependency scanning, and secrets scanning.
- **Merge**: Squash and merge only after all checks and approvals pass.
- **Code Sanity**: Reviews focus on PR size limits, readability, performance, and security.
- **AppSec Verification**: CI-integrated with dedicated review for sensitive modules.

## 12. How to Use This Plan

1. Open this file before any work.
2. Reference relevant sections in every issue and PR.
3. Update this document only through PR when process or scope changes.
4. New contributors must read this first.
5. Treat it as the project constitution and keep it visible during active work.

**ADR 0002 Status** (completed April 25, 2026): ✅ DONE

The control-plane / tenant split is fully live:

- `lib/supabase/control-plane.ts` and `lib/supabase/tenant.ts` are separate, named clients.
- All data loaders use the correct surface client — no cross-boundary bleed.
- `supabase/control-plane/` contains the dedicated Supabase project (ref: `iopydttovnyjgikprvol`) config, schema, and seed data.
- All four control-plane env vars (`CONTROL_PLANE_SUPABASE_URL`, `CONTROL_PLANE_SUPABASE_PUBLISHABLE_KEY`, `CONTROL_PLANE_SUPABASE_SERVICE_ROLE_KEY`, `CONTROL_PLANE_DB_URL`) are set in `.env.local` and in Vercel (Production + Preview).
- Tenant registry rows (`tenants`, `tenant_connections`) exist only in the control-plane project.
- The shared-project fallback has been removed from `lib/supabase/config.ts`.
- Migration `20260425010000_drop_control_plane_tables_from_tenant.sql` has been applied to the tenant project to drop the vestigial registry tables.

## Current Status and History

This section is the history of what shipped and why, round by round through the Council Review protocol (`improve-software.md`, `docs/reviews/`). **Open work and status live in [§0](#0-mvp-roadmap-to-october-30-2026-tracker), not here.** Keep the two in sync: every Council round adds a history bullet here and updates §0's tracker rows.

### MVP readiness history

**MVP readiness: 70/100** (Council Review 19, 2026-09-26): up from 69/100 at Review 18, up from 65/100, where it sat through Reviews 9–13. Service planning Stories 1–2, the blocking E2E test net, and now Story 3 (rotation planner) moved it.

**The MVP definition, the five competitive gaps with their definitions of done, the working order and the production-safety track moved to [§0](#0-mvp-roadmap-to-october-30-2026-tracker) on 2026-09-26.** §0 is the one place for open work, tracked row by row against the October 30, 2026 finish date. The bullets below are the history of what shipped.

**Legacy doc note:** `docs/plans/mvp-competitive-go-no-go-checklist.md` and `docs/mvp-competitive-analysis.md` predate Council Review 9 and describe the retired Phase A–D gate framework. The 2026-09-26 MVP definition in §0 supersedes them, and both now carry a superseded notice.

- **Shipped and merged to `main`**: control-plane/tenant split (ADR 0002), localization governance framework (CC-L10N-001/002), Church Operations module, Communications send lifecycle, first AI Ministry Tools integration (CC-AI-001, Claude-powered sermon planning + Bible study Q&A), calendar overhaul, demo feedback hardening.
- **Landed via Council Review 9** (this pass): ~3 months of previously-unmerged work — Project HQ governance dashboard, security/audit hardening (Council Reviews 2–7: consent-log immutability, pastoral-note encryption, audit logging, session timeout, CSV import limits, DB health checks), volunteer sessional confirmation system, sandbox onboarding wizard, hardened CSV import mapping, volunteer burnout/vitality analytics, custom report builder, and platform-admin tenant CRUD + data erasure (hardened per ADR 0021 as part of this round).
- **MVP readiness**: 65/100 per Council Review 9's feature/competitive audit (`docs/reviews/2026-09-17-council-review-9-agent-4-feature-competitive.md`). Phase A (controlled single-church pilot) is GO. Phase B–D (broader evaluator, compliance-first, mid-market) are NO-GO pending service planning, phone-first mobile UX, recurring giving, incumbent migration tooling, and — the binding constraint — at least one real church completing onboarding uncoached. See `docs/plans/mvp-competitive-go-no-go-checklist.md`.
- **Process change**: the Council now runs before every non-trivial merge to `main`, with a 5th agent (Documenter) responsible for keeping this file, `CHANGELOG.md`, and memory in sync after each round — see `improve-software.md` §0 and `AGENTS.md`. This section exists because that step was missing for Council Reviews 1–8.
- **Shipped on `feat/generic-tenant-provisioning-and-rls-ci-gate`**: a generic client-account provisioning tool (`npm run provision:tenant`, `scripts/provision-tenant.mjs` + `scripts/lib/tenant-provisioning-core.mjs`), replacing the ad hoc practice of copying `scripts/seed-casa-refugio.mjs` per new client; and a fix to `.github/workflows/ci.yml`'s RLS audit step, which previously ran with `continue-on-error: true` and no database in the job — `scripts/audit-rls.mjs` always hit its "DB unavailable" fallback and silently passed without checking anything. CI now starts and migrates a local Supabase instance before the audit and the step blocks the build. Verified via `node --check` on both new scripts, a clean `eslint` run, and two live `npm run audit:rls` passes (100/100 `church_id`-bearing tables, zero RLS gaps). Documented in `docs/control-plane.md` and `docs/tenant-data-segmentation.md`.
- **Council Review 10** (2026-09-18): a full whole-app audit (all four Phase 1 prompts, not a diff-scoped review) run at the user's explicit request against the small branch above, treated as a periodic full-MVP checkpoint. No findings against that branch's actual changes (CI/tooling is outside the four audit prompts' scope) and no critical findings anywhere in the app — no ADRs needed. MVP readiness reconfirmed at **65/100**, unchanged from Council Review 9 (`docs/reviews/2026-09-18-council-review-10-agent-4-feature-competitive.md`), meaning the Phase B–D blockers below are still current. Two corrections were applied to agent self-reports during synthesis (see `docs/reviews/2026-09-18-council-review-10-synthesis.md` §2): Agent 1's own narrative claim of "~8 tables still pending RLS enable" contradicted its own detailed findings and two live `audit:rls` runs this session (both clean) and was logged as a synthesis error, not a real gap; Agent 3's "no root error boundary" claim was stale — `app/global-error.tsx` shipped in PR #139 before this round ran. New deferred, non-blocking findings from this round: `audit_log` is missing `church_id`/`actor_role` columns, no dead-letter queue for failed webhook retries, no unit tests for `lib/finance-import.ts` parsers, and a repeat of Review 9's ARIA/loading-skeleton gap (`MemberBottomNav` `aria-current`, no loading skeletons in `/app`) still unaddressed one round later.
- **Localization: skill installed, real Spanish coverage state documented (`feat/language-translation-skill-and-es-review`, 2026-09-18):** installed a repo-local `.claude/skills/language-translation/SKILL.md` translation-pipeline skill, adapted with ChurchCore-specific notes so it treats `lib/i18n.ts`/`useI18n()`/`lib/localization-governance/` as the existing system to extend, not a from-scratch translation task. A scoped evaluation (`docs/reviews/2026-09-18-spanish-translation-evaluation.md`) confirmed `es`/`es-PR` already carry exact 1,010-key parity with `en`. The two real, open gaps are (1) **coverage** — only ~34 components call `useI18n()`; Children's Ministry, Ministry Forge, Volunteers, Groups, Events, Attendance, Reports, Operations, Workflows, Control Plane, and Pastor tools have zero coverage (already tracked in `docs/plans/spanish-ui-coverage.md`'s Remaining Surface Queue) — and (2) **native-speaker linguistic review has never happened** on the `es` catalog (ADR 0009 Decision 5). A linguistic-review pass fixed 7 objective accent/spelling errors plus one untranslated `es-PR` string; ~100 other proposed wording changes were explicitly **not** applied after the review agent admitted shortcutting most of them (see `docs/reviews/2026-09-18-spanish-catalog-linguistic-review.md`). The governance catalog's `validated` (not `approved`) state is unchanged — this was a hygiene pass, not the human review ADR 0009 requires. Because the branch (458-line skill file + catalog edits) is too large for `improve-software.md` §0's small-isolated-fix exception, a Council-equivalent synthesis (`docs/reviews/2026-09-18-language-translation-skill-synthesis.md`) resolved 7 findings from this repo's automated PR review, including a governance-naming footgun (`translations_approved` is an automated opinion, not human approval) and a missed accent error. **Open follow-ups, not resolved here:** (a) run the actual human native-speaker governance review (`requestReview()`/`submitReview()`) on the `es` catalog; (b) expand `useI18n()` coverage module-by-module as separate `feature-factory` stories, following `components/application/daily-desk-workspace.tsx`'s existing pattern.

- **Landing page redesign + Council Review 11 (`feature/landing-page-sacred-clarity`, 2026-09-19 → 2026-09-20):** rebuilt `/` with a full "Sacred Clarity" marketing treatment (hero with live-product preview cards, platform capability grid, product-family ecosystem section, closing CTA), reversing the 1.0.0 foundation release's deliberate "minimal entry surface" simplification (README §Current Application Surface updated) — a conscious direction change confirmed with the user, not an accidental regression of that earlier decision. No new dependencies (reuses the existing self-hosted `--font-fraunces`/`--font-manrope` fonts and the existing `lucide-react` icon set); all copy localized through `publicHome` in `lib/i18n.ts`. A diff-scoped Council Review 11 (4 agents, `docs/reviews/2026-09-20-council-review-11-synthesis.md`) then audited this page and found 5 actionable issues, all fixed in a follow-up commit before merge: `TEXT_MUTED`/`TEXT_DIM` opacity tokens raised (0.45→0.62, 0.35→0.58) to clear WCAG AA contrast against the dark ground (script-verified: 5.79:1 and 5.23:1 respectively, both previously failing at 3.66:1/2.72:1); the hero stat-card `SimpleGrid` made responsive (`cols={{ base: 1, sm: 2 }}`, previously hardcoded `cols={2}` and non-stacking on phones); the "Watch the overview" play affordance bumped from 40×40px to the 44×44px minimum touch target; and the "Trusted by: Grace Chapel, Cornerstone, City Church, New Life" social-proof strip — which falsely implied named existing customers — replaced with honest target-segment labels (`audienceSegmentsLabel` + 4 segment keys) across all three locales. The synthesis also corrected an error in its own Agent 3 report: Agent 3 claimed GOLD-on-ground text was "~4.3:1, borderline fail"; an independent script-verified recalculation showed 7.19:1, a comfortable pass, so no gold-related change was made — a concrete instance of the standing lesson that an agent's own numeric claims need computational, not just narrative, verification. Three `href="#"` placeholders (Pricing/Watch-overview/Advisor-link) were left as intentional — no destination page exists yet for any of them — and the illustrative dashboard-preview numbers were judged standard, low-risk SaaS convention and left as-is. No ADR was warranted (confirmed independently by the synthesis: no new architectural boundary, access pattern, or data-exposure rule, only color-token/layout/copy fixes in one client component). The i18n catalog's net key count is unchanged by the fix commit (5 keys removed, 5 added per locale) — full catalog independently re-measured at exact 1,082/1,082/1,082 key parity across `en`/`es`/`es-PR`, same as the first commit. Verified after the fix commit: `npx vitest run app/page.test.tsx lib/i18n-ws-c4-coverage.test.ts` (222/222), `npm run lint` (0 errors, 7 pre-existing warnings unrelated to this branch), `npm run typecheck` (clean), `npm run build` (all 118 routes), full `npx vitest run` (1417/1417). Residual, non-blocking: no browser-automation/visual-screenshot pass was possible in this environment (server-render check only); Council Review 11 also surfaced a genuinely new but out-of-scope finding — `/app/member` is referenced by `member-bottom-nav.tsx` and `app/portal/page.tsx` but no `app/app/member/page.tsx` exists (a real 404 risk), logged as follow-up backlog, not fixed on this branch. See `docs/factory-runs/2026-09-20-landing-page-sacred-clarity-council-review-11.md` for the full close-out.

- **Webhook DLQ, finance-import parser tests, and the repeat ARIA/loading-skeleton gap closed; Council Review 12 (`fix/webhook-dlq-finance-tests-aria-skeleton`, 2026-09-20):** closed three of the smaller backlog items carried since Council Review 10 in one branch, then ran a full whole-app Council Review 12 to confirm the fixes and re-check overall MVP health.
  - `aria-current="page"` now set on active nav links in `MemberBottomNav` and all three `NavLink` usages in `ApplicationShell` (module nav, workspace link, calendar link) — Mantine's `NavLink` only applies a styling `data-active` attribute, not `aria-current`, so this was a real screen-reader gap, not styling-only. New tests in `components/application/app-shell.test.tsx` and `components/application/member-bottom-nav.test.tsx`.
  - A new `PageLoadingSkeleton` component (`components/application/page-loading-skeleton.tsx`) is wired via Next.js's `loading.tsx` convention at `app/app/loading.tsx`, `app/portal/loading.tsx`, and `app/control/loading.tsx` — the three major route-segment roots — giving visible progress feedback during server-side data fetches instead of a blank screen, closing the other half of the Council Review 9/10 finding ("zero skeleton/loader components across `/app`").
  - `lib/finance-import.test.ts` grew from 13 to 27 tests, adding real coverage for `parseCsv`, `parseXlsx`, `parsePlainText`, and `detectFormat` — the four functions the finance import wizard's first step (`components/application/finance-import-wizard.tsx`) actually calls, and the ones Council Review 10 found untested.
  - A new `communication_dlq` table (`supabase/migrations/20260920000000_communication_dlq.sql`, RLS-scoped via the existing `can_manage_communications()` helper, `select`-only for `authenticated`) records permanent retry exhaustion. `lib/communications/retry-eligible.ts`'s `markFailedAgain()` now writes a DLQ row once `retry_count` reaches the max of 3, closing the Review 10 finding that exhausted retries silently stayed at `status='failed'` forever with no record of when/why the cron gave up. Deliberately backend-only (no UI) — judged sufficient scope. The DLQ write is deliberately non-throwing (logs and continues) to avoid double-invoking the caller's own `markFailedAgain` from inside its try/catch; covered by a dedicated regression test in `lib/communications/retry-eligible.test.ts`.
  - **Council Review 12** (full whole-app audit, chosen over a diff-scoped review at the user's preference for consistency with Review 10, which had already run the whole-app version 2 days prior): no blockers. MVP readiness reconfirmed **65/100 for the fourth consecutive round** (Reviews 9, 10, 11, 12). RLS remains fully clean across all 114 tables (up from 107 at Review 10), including the new `communication_dlq` table. This branch's fixes were independently re-verified in source by the council agents, not just taken from commit messages. Three factual corrections were needed during synthesis (`docs/reviews/2026-09-20-council-review-12-synthesis.md`), all resolved by reading the actual source rather than trusting the claim: a false "`app/app/member/page.tsx` missing, live 404" claim (a Next.js dynamic `[role]` route already handles it — this contradicted another agent's own correct report in the same round); a false "finance-import parsers still untested" claim (this branch's own commit had already fixed that before the audit ran); and a false "`audit_log` lacks `church_id`/`actor_role`" claim (contradicted by another agent's own report in the same round, reading the migration that added those columns). New deferred, non-blocking findings: no intermediate `error.tsx` boundaries at `app/app`, `app/portal`, `app/control` (only the root `app/global-error.tsx` exists); a plausible-but-unverified nested-`loading.tsx` gap in deeper member subroutes; and finance-import's batch-commit/GL-posting workflow (distinct from the now-tested parsers) still has no test coverage. No ADR needed — confirmed independently by the synthesis (existing patterns applied: `can_manage_communications()` RLS helper, Next.js `loading.tsx` convention).

- **Song library & setlist builder — Story 1 of the Service Planning split; Council Review 14 (`feat/service-planning-song-library`, 2026-09-22):** implements the first of five stories closing Council Review 9's #1-ranked competitive gap ("no setlist builder, song library, or volunteer-role matching for services"), reconfirmed unchanged through five consecutive Council rounds (Reviews 9–13, all at 65/100 MVP readiness). Stories 2–5 (role taxonomy & team roster, rotation planner, rehearsal scheduling, and a precondition schema change making `event_id` required on `service_plans`) are separate, not-yet-started follow-up stories — not done here.
  - New church-wide `song_library` table ([supabase/migrations/20260922000000_song_library_and_setlist.sql](supabase/migrations/20260922000000_song_library_and_setlist.sql)), RLS-scoped with the same `can_manage_church()`/`belongs_to_church()` pattern already used by `service_plan_items`, idempotency-key retry-safe for concurrent/retried creates, with a nullable `service_plan_items.song_library_id` FK (`on delete set null`) and a new per-church `churches.song_repeat_window_weeks` setting (default 12).
  - New server actions in `app/app/volunteer-actions.ts`: search, add-existing-song-to-plan, create-and-link-new-song, remove-item. `last_used_date` propagates to linked songs only when a plan is marked complete, using the plan's own `service_date` (not `now()`), identically on both the local-fallback and Supabase code paths.
  - Fixed a pre-existing auth bug: service-plan write actions and the three page routes under `app/app/church-admin/volunteers/*` were church-admin-only, narrower than the `can_manage_church()` RLS policy already covering these tables (church-admin/pastor/ministry-leader) — pastor and ministry-leader could write via RLS but were silently redirected away at the page layer. Widened consistently at both layers.
  - New UI in `components/application/volunteer-schedule.tsx`: song search-and-add, inline song creation, drag-and-drop reorder (new `@dnd-kit/core`/`@dnd-kit/sortable`/`@dnd-kit/utilities` dependency) alongside the pre-existing move-up/down buttons, a remove-item button, a non-blocking repeat-usage warning, and a distinct re-auth prompt that never silently discards a pending reorder. Deliberately not internationalized (`useI18n()`) in this pass — an already-approved scope decision; i18n expansion continues module-by-module as separate stories, not a gap in this branch.
  - **Council Review 14** (`docs/reviews/2026-09-22-council-review-14-synthesis.md`, diff-scoped): all four agents confirm no blockers. No ADR needed — confirmed independently by all four agents (reuses existing RLS/auth/UI conventions verbatim, no new architectural boundary). MVP readiness estimated **66–67/100**, the first increase since Council Review 9 established the 65/100 baseline (unchanged across Reviews 9–13) — a real, modest step on Volunteer Scheduling specifically, not a phase-gate change; Phase A remains GO, Phases B–D remain NO-GO (Stories 2–5 are still needed before service planning moves from partially- to substantially-addressed, and Phase D's binding blocker — an uncoached pilot church completing onboarding — is untouched by this branch). Two corrections were made during synthesis, both caught by the Documenter this round rather than mid-round by another agent: Agent 1's own draft cited internally inconsistent table counts ("115" in one place, "114" in another), resolved directly at **115 distinct tables across all migrations, 105 `church_id`-bearing, all 105 passing `audit:rls`** (the ~10-table gap is expected — control-plane-only tables are outside this audit's scope), `song_library` included with 2 policies; Agent 4 cited Council Review 13's stale test count ("1,452/1,452") instead of running the suite itself — this branch's actual count, run directly: **1527/1527 passed, 130 files**. A third finding — Agent 3's `SimpleGrid cols={3}` mobile-breakpoint issue at `volunteer-schedule.tsx:1402` — was confirmed via `git diff main...HEAD` to be pre-existing code outside this branch's diff, logged as backlog rather than folded into this PR's scope. Verified: `npx vitest run` (1527/1527, 130 files), `npm run lint` (0 errors, 7 pre-existing unrelated warnings), `npx tsc --noEmit` (clean), `npm run build` (clean), `npm run audit:rls` (105/105 `church_id`-bearing tables clean, `song_library` included with 2 policies). Full agent reports: [agent-1-database-api](docs/reviews/2026-09-22-council-review-14-agent-1-database-api.md), [agent-2-route-page](docs/reviews/2026-09-22-council-review-14-agent-2-route-page.md), [agent-3-ux-shell](docs/reviews/2026-09-22-council-review-14-agent-3-ux-shell.md), [agent-4-feature-competitive](docs/reviews/2026-09-22-council-review-14-agent-4-feature-competitive.md).

- **Role taxonomy & team roster — Story 2 of the Service Planning split; Council Review 15 (`feat/service-planning-role-taxonomy`, 2026-09-22, stacked on `feat/service-planning-song-library` / PR #146, not yet merged to `main`):** implements the second of five stories closing Council Review 9's #1-ranked competitive gap. Stories 3–5 (rotation planner, rehearsal scheduling, the `event_id`-required schema precondition on `service_plans`) remain separate, not-yet-started follow-up stories — not done here.
  - New church-scoped `service_plan_role_types` table ([supabase/migrations/20260924000000_service_plan_role_taxonomy.sql](supabase/migrations/20260924000000_service_plan_role_taxonomy.sql)), RLS-scoped via the existing `can_manage_church()`/`belongs_to_church()` pattern, with an idempotent migration whose backfill converts existing free-form `service_plan_positions.role_name` text into typed role-type rows — case-insensitive collisions collapse to one row, genuinely different spellings stay separate, and blank/whitespace names coalesce to a placeholder before the `NOT NULL` constraint is applied. FK is a defensive `ON DELETE RESTRICT`.
  - New CRUD server actions (`createRoleTypeAction`, `updateRoleTypeAction`, `deactivateRoleTypeAction`) in `app/app/volunteer-actions.ts` — dual-path (local-fallback + Supabase), matching Story 1's established style in this same file (a deliberate, user-confirmed choice to prioritize in-file consistency over the repo's stricter Supabase-only architecture mandate for this specific story). Server-side validation confirms a role type's `requiredSkills` are real values drawn from `volunteer_profiles.skills`, not just enforced by the UI's non-creatable dropdown — defense in depth, not UI-only.
  - A real cross-tenant write bug found and fixed during this story's own implementation-validator pass, before Council Review 15 ran: `addPlanPositionAction` now calls `fetchServicePlanForWrite(churchId, input.planId)` to verify the target service plan belongs to the caller's own church before inserting a position, on both the local-fallback and Supabase branches — previously it relied only on RLS to catch a cross-church write after the fact.
  - Skill-based ranking in the volunteer-assignment pool: a role type with required skills sorts matching volunteers first with a match-count badge (an "at least one" skill match, not "all"); non-matching volunteers stay visible, never filtered out.
  - A new consolidated roster view on the existing service-plan detail page: one row per position slot, unassigned slots visually flagged, confirmation status shown, with a desktop table / mobile card responsive split matching established patterns.
  - New `/app/church-admin/volunteers/role-types` route for role-type management, gated to church-admin/pastor/ministry-leader — the same three-role gate as the sibling `volunteers`/`volunteers/schedules` routes — with reciprocal nav cross-linking across all four routes in this family.
  - Deliberately not internationalized (`useI18n()`) in this pass — matching Story 1's same already-approved i18n deferral; i18n expansion continues module-by-module as separate stories, not a gap in this branch.
  - **Council Review 15** (`docs/reviews/2026-09-22-council-review-15-synthesis.md`, diff-scoped): all four agents confirm no blockers. No ADR needed — confirmed independently by all four agents (reuses existing RLS/auth/UI conventions, no new architectural boundary). MVP readiness estimated **67–69/100**, up from 66–67/100 after Story 1 — continued incremental, verified progress on Volunteer Scheduling specifically; Phase A remains GO, Phases B–D remain NO-GO (Stories 3–5 are still needed, the other four ranked competitive gaps are untouched, and Phase D's binding blocker — an uncoached pilot church completing onboarding — is unaffected). Agent 4 judges Stories 1+2 combined as an estimated **~75% close** of Council Review 9's #1-ranked gap. Three agent misreadings were caught and corrected during synthesis — unusually, all three understated rather than overstated this branch's completeness (a different failure shape than most prior rounds): Agent 1's first-pass draft wrongly claimed the Supabase branch of `updateRoleTypeAction` skips the new skill-validation check (the check is unconditional, called before the branch split) and separately wrongly claimed zero tests exist for Story 2's actions (34 tests exist in `app/app/service-plan-role-type-actions.test.ts` plus 18 real-Postgres integration tests in `tests/database/service-plan-role-type-taxonomy.test.ts`); Agent 4's first-pass draft wrongly claimed skill-based ranking is deferred to Story 3 (it's built and tested in this branch — Story 3 actually defers the separate rotation/auto-assignment *planner* logic, a distinct capability). Verified: `npx vitest run` (**1598/1598 passed, 134 test files**), `npx vitest run --config vitest.db.config.ts` (**18/18 passed, 3 files**, real-Postgres integration tests), `npm run lint` (0 errors, 7 pre-existing unrelated warnings), `npx tsc --noEmit` (clean), `npm run build` (clean), `npm run audit:rls` (passed, `service_plan_role_types` included with 2 policies). Deferred, non-blocking findings: missing contextual `aria-label`s on `RoleTypeManager`'s Edit/Deactivate buttons (not fixed — 8 existing test assertions depend on the current exact accessible names); no centralized skill catalog/governance table (skill vocabulary is currently implicit from `volunteer_profiles.skills`); the pre-existing `SimpleGrid cols={3}` mobile-breakpoint issue carried forward from Council Review 14, still outside any Story 1/2 diff. Full agent reports: [agent-1-database-api](docs/reviews/2026-09-22-council-review-15-agent-1-database-api.md), [agent-2-route-page](docs/reviews/2026-09-22-council-review-15-agent-2-route-page.md), [agent-3-ux-shell](docs/reviews/2026-09-22-council-review-15-agent-3-ux-shell.md), [agent-4-feature-competitive](docs/reviews/2026-09-22-council-review-15-agent-4-feature-competitive.md).

- **Error boundaries, finance batch-commit test coverage, and the `/app/member` question closed; Council Review 13 (`fix/error-boundaries-finance-tests-member-route`, 2026-09-20):** closed the three smaller backlog items Council Review 12 left open in its "Next" line.
  - Three scoped `error.tsx` route-segment boundaries added — `app/app/error.tsx`, `app/portal/error.tsx`, `app/control/error.tsx` — each delegating to a new shared `components/application/page-error-boundary.tsx` (`PageErrorBoundary`) that reports to Sentry (`Sentry.captureException`, same pattern as `app/global-error.tsx`) and offers a Mantine `Alert` + "Try again" button wired to Next's `reset()`. Mirrors the `PageLoadingSkeleton`/`loading.tsx` convention already wired at these same three roots (Council Review 12). New tests in `components/application/page-error-boundary.test.tsx` (2 tests: Sentry reporting on mount, `reset()` called on click).
  - Test coverage added for `importFinanceRowsAction`'s batch-commit/journal-posting workflow in `app/app/finance-actions.test.ts` (new `describe("importFinanceRowsAction batch commit")`, 3 tests: local-fallback-mode commit, Supabase-path commit, debit/credit account-code resolution), each asserting the exact `finance_journal_lines` rows a committed import produces (account id, side, amount_cents, sort_order) — distinct from the finance-import *parsers*, which already had 27 tests from Council Review 12.
  - The standing "`/app/member` 404 risk" question (opened Council Review 11, investigated Review 12) is now closed by direct confirmation: `app/app/[role]/page.tsx` is a dynamic catch-all that renders `MemberPortalHome` when `params.role === "member"`. No code change was needed — a documentation close, not a fix.
  - **Council Review 13** (`docs/reviews/2026-09-20-council-review-13-synthesis.md`): diff-scoped (this branch's footprint is narrower than Review 12's — no RLS/migration/shared-shell changes, just three new route files and one new shared component), all four agents confirm no blockers. During synthesis, Agents 3 and 4 initially restated Review 12's "finance batch-commit/GL-posting gap" as still open, and Agent 4 additionally asserted a nonexistent "GL auto-posting background process." Agent 1 read the source directly — `postJournalAction` only flips `finance_journals.status` from `draft` to `posted`; no cron or background process touches finance journals or journal lines anywhere in the codebase (the only GL-adjacent background path, `donation_gl_posts`, belongs to the unrelated Stripe-donation flow) — and Agent 4 reviewed that finding and retracted its claim in its own report before synthesis finalized. Resolved: the gap is fully closed, not partially closed. This is a fresh instance of the standing `feedback_council_synthesis_scrutiny` memory lesson (an agent's own narrative claim needs source verification, not repetition) — the new twist is it was caught *during* synthesis by another agent, not after the fact by the Documenter. No ADR needed — confirmed independently by all four agents (existing-convention reuse only: Sentry+Mantine error UI, the existing action-test mocking pattern). MVP readiness reconfirmed **65/100 for a fifth consecutive round** (Reviews 9–13); RLS remains 114/114 `church_id`-bearing tables, unchanged since Review 12 (this branch adds no migrations). Verified on the implementation commit (rewritten post-review from `6279671` to `0c6d003` to fix an `unverified_email` placeholder-address issue caught during Documenter close-out — see below; content unchanged, byte-identical diff): `npm run lint` (0 errors, 7 pre-existing unrelated warnings, unchanged baseline), `npm run build` (all routes clean), `npx vitest run` (**1452/1452 passed**, 127 test files — up from 1447 at Review 12, reflecting this branch's 5 new tests: 2 in `page-error-boundary.test.tsx`, 3 in `finance-actions.test.ts`). Full agent reports: [agent-1-database-api](docs/reviews/2026-09-20-council-review-13-agent-1-database-api.md), [agent-2-route-page](docs/reviews/2026-09-20-council-review-13-agent-2-route-page.md), [agent-3-ux-shell](docs/reviews/2026-09-20-council-review-13-agent-3-ux-shell.md), [agent-4-feature-competitive](docs/reviews/2026-09-20-council-review-13-agent-4-feature-competitive.md).

- **Communications retry/DLQ hardening; Council Review 16 (`fix/comms-retry-dlq-copilot-findings`, 2026-09-23):** closed five GitHub Copilot findings on PR #143 (Council Review 12, webhook DLQ) that Council Review 12 approved without catching — the third time GitHub's own automated review has caught something a Council round missed (after the `language-translation-skill` branch and the finance-import mapped-code bug, Council Review 13/PR #145). First commit (`00c49bb`) stopped the retry cron's fan-out (`recordLog: false`, outcome recorded on the source row), stopped false DLQ records (a new `updateSourceRow` helper guarded on `retry_count`, never throws), dead-lettered exhausted no-send attempts, and separated `error_code`/`error_message` from the provider message. A diff-scoped Council Review 16 (`docs/reviews/2026-09-23-council-review-16-synthesis.md`) then reviewed that commit: all four agents approved, no blockers, no new ADR needed for this branch itself. The human approved three in-branch implementation prompts, landed in a second commit (`4f2ce1c`):
  - **P1:** the operator's per-row manual Retry (`retryCommunicationAction`) now shares the cron's exported `attemptRetry()` instead of independently reproducing the same fan-out bug on the manual path — no new log row, outcome recorded on the original.
  - **P2:** `retry_count` is now claimed via a guarded update *before* dispatch (not after), closing a double-send window between overlapping cron runs; `updateSourceRow` dropped its local-fallback branch and is now Supabase-only, per the Supabase-only mandate.
  - **P3:** `recipient_opted_out` split from `recipient_suppressed` via a new `skipCode` field; stored error text truncated to 500 characters; source-row update guard gained a `church_id` check.
  - MVP readiness reconfirmed **68/100, unchanged** (within Review 15's 67–69 band) — this branch fixes correctness on a communications path production can't yet reach (see below), so it doesn't move the needle on its own. Council Review 16 also corrected this branch's own factory-run doc: Agent 4 verified Resend — ADR 0006's designated primary provider — is never actually selected for sending in code (`queue-communication.ts` always uses the SendGrid adapter); combined with the pre-existing SendGrid/Twilio adapter-code mismatch, **no path in production currently writes a transient `error_code` at all**, so the retry cron and manual Retry both currently get no real input. ADR 0006 now carries a dated implementation-status note rather than being rewritten.
  - **Open follow-ups, not resolved on this branch, tracked as P1 gaps in the order below (F1 must precede F2):**
    - **F1 (compliance):** the cron's `findSuppression`/`checkOptIn` lookups run through the cookie-based client with no session, so they execute as anon against `to authenticated` RLS and silently return nothing — suppressed/opted-out recipients could be re-sent, and every SMS retry reads as opted-out. Latent today only because no transient code is ever written; becomes live the moment F2 ships, so F1 must land first.
    - **F2 (provider wiring):** implement Resend selection per ADR 0006 (or amend the ADR), and map SendGrid/Twilio HTTP statuses and thrown errors to the transient-code set used by the retry cron.
    - **F3:** DLQ visibility — Sentry reporting for swallowed bookkeeping failures, a bookkeeping-failure count feeding the cron's 207, a tooltip on the disabled Retry button, a minimal DLQ view.
    - **F4:** verify whether the webhook log lookup (outside this diff) can actually match rows under its own anon cookie client — plausible, not confirmed this round.
  - Verified after `4f2ce1c`: `npx tsc --noEmit` clean, `npx vitest run` (**1611/1611 passed**, 134 files, independently re-run by the Documenter), `npm run lint` (0 errors, 7 pre-existing unrelated warnings), `npm run build` clean. Full agent reports: [agent-1-database-api](docs/reviews/2026-09-23-council-review-16-agent-1-database-api.md), [agent-2-route-page](docs/reviews/2026-09-23-council-review-16-agent-2-route-page.md), [agent-3-ux-shell](docs/reviews/2026-09-23-council-review-16-agent-3-ux-shell.md), [agent-4-feature-competitive](docs/reviews/2026-09-23-council-review-16-agent-4-feature-competitive.md). Documented in [docs/factory-runs/2026-09-23-comms-retry-dlq-copilot-findings.md](docs/factory-runs/2026-09-23-comms-retry-dlq-copilot-findings.md).

- **F1 closed; unauthenticated server actions locked down; scheduled broadcasts now deliver — Council Review 17 (`fix/comms-cron-consent-suppression-lookups`, 2026-09-23):** closed Council Review 16's F1 (`56247ae`) — `findSuppression`, `checkOptIn`, `writeLog`, `writeSuppressedLog` moved from the cookie-bound client to the admin client, scoped by the server-side `church_id` ([ADR 0022](docs/adr/0022-communications-compliance-lookups-admin-client.md)) — then ran Council Review 17 on that commit and implemented its four approved prompts (`6e005d4`):
  - **P1 (security, HIGH, required before merge):** `lib/notifications/queue-communication.ts`'s `queueCommunicationAction` was a `"use server"` export trusting a caller-supplied `session`. Verifying it surfaced the same pattern, unauthenticated, in `lib/actions/audit.ts` — `logAuditEvent` and `pruneAuditLogsAction` wrote with the service role with **no auth check**, and `pruneAuditLogsAction` deletes `audit_log` across every church. All three are now `import "server-only"`, confirmed removed from the built server-reference manifest; `pruneAuditLogsAction` was kept (ADR 0012 `pg_cron` retention lineage), not deleted.
  - **P2:** `resolveRecipients` and the compose parent insert also moved to the admin client. Scheduled broadcasts now actually deliver on Supabase for the first time (SMS included, Twilio-billed); the cron marks a broadcast `failed`/`no_delivery` instead of `sent` when nobody was reached; secretary compose closes out its parent row instead of staying `queued` forever.
  - **P3/P4:** per-recipient try/catch with honest counts; `writeSuppressedLog` honours `recordLog: false`; a thrown retry dispatch/lookup is now `temporary_failure` (retries within budget) instead of dead-lettering immediately; `ilike` wildcards escaped in `findSuppression`; the unsubscribe route checks its upsert error; dead `lib/notifications/send-sms.ts` removed.
  - **Council Review 17** (`docs/reviews/2026-09-23-council-review-17-synthesis.md`, diff-scoped): 4/4 agents approved, tenant scoping on all four moved calls confirmed. Two corrections made during synthesis: our own ADR 0022 draft and `56247ae`'s commit message were wrong that the scheduled cron reached unsubscribed addresses — `resolveRecipients` also ran as anon, so it sent to **nobody**, not to unsubscribed addresses (the second consecutive round where our own write-up, not an agent, was the source of an inaccuracy — see Review 16 §2); and the P1 finding above, discovered while verifying Agent 1's `queueCommunicationAction` claim. MVP readiness reconfirmed **68/100, unchanged**. **Open follow-ups:** **F2** Resend wiring + transient-code mapping; **F4** delivery webhooks (`webhook-events.ts`) under ADR 0022, must land before or with F2 (bounce/STOP suppression depends on it); **F6** `broadcastMessageAction` should resolve recipients server-side from ids, not a client-supplied contact/profile pair; **F7** decide what a secretary should actually be able to do (role gate admits secretary, RLS on compose/retry/history doesn't); **F8** crons fail open without `CRON_SECRET` outside production; **F3** (unchanged) DLQ visibility. Verified: `npx tsc --noEmit` clean, `npx vitest run` (**1629/1629 passed**, 135 files), `npm run lint` (0 errors, 7 pre-existing unrelated warnings), `npm run build` clean. Full agent reports: [agent-1-database-api](docs/reviews/2026-09-23-council-review-17-agent-1-database-api.md), [agent-2-route-page](docs/reviews/2026-09-23-council-review-17-agent-2-route-page.md), [agent-3-ux-shell](docs/reviews/2026-09-23-council-review-17-agent-3-ux-shell.md), [agent-4-feature-competitive](docs/reviews/2026-09-23-council-review-17-agent-4-feature-competitive.md). Documented in [docs/factory-runs/2026-09-23-comms-cron-consent-suppression-council-review-17.md](docs/factory-runs/2026-09-23-comms-cron-consent-suppression-council-review-17.md).

- **E2E testing foundation, Story A of 2 (`feat/e2e-testing-foundation`, PR #150 draft, 2026-09-23/24):** a side-step before resuming comms follow-up F4, at the user's request — a full test suite (API + browser) over the whole app, plus a standing "every change ships its test surfaces" release rule. Built via the feature-factory chain (research → story → brief → builders → implementation-validator), then Council Review 18. Ships `tests/coverage-manifest.json` (117 pages, 15 API routes, 30 server-action modules) and `npm run test:surfaces` (`scripts/test-surfaces.mjs`), a Playwright page×role sweep over every page for 6 identities plus signed-out, API contract tests for all 15 routes, a two-stack local e2e environment (tenant + control plane), a blocking CI `e2e` job (4 shards), and `scripts/backfill-pastoral-encryption.mjs`.
  - **Council Review 18** (`docs/reviews/2026-09-24-council-review-18-synthesis.md`, diff-scoped against `main` at `50d919b`, 4 agents): no manifest `allowedRoles` disagreement with the code found. Corrections made during synthesis: three safety holes in the local-only guard (H1–H3, verified and fixed same-session); the `/hq` known bug's stated cause was corrected: the design flaw is real (`/hq` gates on `profiles.role` while the rest of the app uses membership roles), but the seeded secretary is denied because her profile role drifted from the seed's `secretary` to `member_volunteer`, which is not yet traced; the sweep's super-admin-on-tenant-pages `/sign-in` expectation was a **local artifact** (both local stacks shared one auth cookie name) — addressing the control plane as `localhost` corrected it to `/control`, the real production landing, and confirmed `/hq` does not admit super-admin; and a ministry-leader over-exposure to `communication_logs` via RLS was found, widening follow-up F7 into a two-sided (under- *and* over-exposure) access-control gap.
  - The human approved all five implementation prompts, landed in three commits: **P1** (`19aea6a`, safety — H1–H3 fixed, backfill script hardened with pagination/dry-run/decrypt-guard, local key moved to a gitignored file); **P2** (`a5e00f0`, enforcement — `test:surfaces` now fails on export drift and on an untested-and-unwaived action export; 62 exports currently waived with reasons); **P3–P5** (`7125e3b`, sweep false greens closed, `failOnFlakyTests` in CI, `/api/reports/custom` and `/api/control/*` role tests, process text updated across `AGENTS.md`/`.claude/agents`/`docs/testing.md`); plus `a741b76`, which narrowly tolerates and records an intermittent React #418 hydration error on `/app/member` (member role only) as a follow-up rather than hiding it.
  - **MVP readiness 69/100 (+1)** (Agent 4) — see the snapshot above. Final CI on `a741b76`: **809 e2e tests across 4 shards, 0 flaky** (`failOnFlakyTests` on), plus `verify`, CodeQL, gitleaks, dependency-review all green. Locally: `npx vitest run` **1707/1707 passed** (144 files), `npm run test:surfaces` clean, `npm run lint` (0 errors, 7 pre-existing warnings), `npx tsc --noEmit` clean.
  - **Follow-ups, in the synthesis's priority order:** (1) **F7**, now High — align `communication_logs` RLS with the page gates (secretary under-exposed, ministry-leader over-exposed) and add a pure church-admin fixture so the sweep stops passing through the platform-admin RLS bypass; (2) webhook fail-open when a provider secret is unset (all four; Stripe also has no replay window) — dangerous in production, belongs with F4 before F2; (3) `/api/reports/custom` — move `requireChurchSession` out of the `try`, replace `queryTenantLocalDb` (bypasses RLS); (4) `/hq` — trace the `profiles.role` vs. membership-role drift and add `church_id` to the `hq_*` tables; (5) Story B journeys (comms, child safety, service planning, pastoral, giving/finance, people), ranked in Agent 4's order; (6) close the 62-export untested-exports list `test:surfaces` now makes explicit, starting with child safety and pastoral; (7) CI build-once artifact, hosted-preview super-admin verification, demo-route 403 outside demo mode.
  - Full agent reports: [agent-1-database-api](docs/reviews/2026-09-24-council-review-18-agent-1-database-api.md), [agent-2-route-page](docs/reviews/2026-09-24-council-review-18-agent-2-route-page.md), [agent-3-ux-shell](docs/reviews/2026-09-24-council-review-18-agent-3-ux-shell.md), [agent-4-feature-competitive](docs/reviews/2026-09-24-council-review-18-agent-4-feature-competitive.md).

- **Rotation planner — Story 3 of the Service Planning split; Council Review 19 (`feat/service-planning-rotation-planner`, 2026-09-26, not yet merged to `main`):** implements the third of five stories closing Council Review 9's #1-ranked competitive gap. Stacked on PR #151 (`7ef296f`, docs-only MVP redefinition, not yet merged). Stories 4–5 (rehearsal scheduling, the `event_id`-required schema precondition) remain not-started follow-up stories.
  - Ranked volunteer suggestions per open position (eligibility → skills → 30-day load → time since last served → name), a reviewable whole-plan auto-fill that re-validates on apply, and a per-volunteer monthly service limit. Two new SECURITY INVOKER SQL functions, `get_volunteer_pool()`/`get_volunteer_directory()` ([supabase/migrations/20260926000000_service_plan_rotation_planner.sql](supabase/migrations/20260926000000_service_plan_rotation_planner.sql)).
  - Fixed four production bugs found and verified in this pass: the assignment picker and the volunteer directory were both always empty (a non-existent column reference; an un-embedded-relation PostgREST filter); assigning on a plan with a service time violated `volunteer_shifts`' `ends_at > starts_at` CHECK; the Supabase assign path had no same-day double-booking check (the local path always did); the volunteer directory crashed as soon as it had rows, from Mantine `Table.*` dot-notation members being undefined in a server component (only found by the e2e sweep, since the directory had never had rows before).
  - **Council Review 19** (`docs/reviews/2026-09-26-council-review-19-synthesis.md`, diff-scoped): no blockers. All four agents' implementation prompts approved by the owner and landed in a follow-up commit (`c32c897`): **P1** database — a missing `volunteer_shifts(church_id, assigned_user_id, starts_at)` index; both SQL functions rewritten as grouped aggregates instead of per-profile correlated subqueries (previously roughly O(profiles × shifts) per call); a sargable year-range filter on the directory; `EXECUTE` revoked from `public`/`anon`; the DB tests now run as `authenticated` with real JWT claims, proving role parity and cross-tenant denial. **P2** assignment integrity — `assignVolunteerAction` now verifies the position is on the plan in the caller's church, the volunteer is in the church, and the position has an open slot; `applyPlanAutoFillAction` re-applies the required-skill rule. **P4** planner rule — only known volunteers (a volunteer profile, or anyone ever scheduled) are suggested or auto-filled; everyone else can still be assigned by hand. **P3** UX — modal feedback (a successful assign/apply closes its modal and updates the roster in place, since `ServicePlanBuilder` holds the plan in `useState` and a route refresh alone leaves it stale; errors surface inside the open modal; the suggestions fetch gets an error state and a `.catch`), monthly-limit and same-day badges in the full volunteer list, one consistent set of labels, pluralized "Apply N assignment(s)", an empty-state line, reopened slots on removal, and a scroll container for the directory on phones.
  - Two agent claims were corrected during synthesis/implementation, not accepted as written (`feedback_council_synthesis_scrutiny` memory, a new instance each): Agent 4's example for "auto-fill can propose a non-volunteer" cited the seeded Greeter fill specifically — wrong, since Greeter requires `hospitality` and the two people it filled both have that skill — but the underlying point (a role with *no* required skills has no such guard) was right and is fixed by P4. Agent 2's claim that `window.location.reload()` is unnecessary because `applyPlanAutoFillAction`'s `revalidatePath` already updates the page was wrong for this component specifically: `ServicePlanBuilder` keeps the plan in `useState(initialDetail)`, so a router refresh fetches new server props but never updates that state; the fix that shipped instead adds new shifts to local state directly and closes the modal, with no reload and no router refresh.
  - No new ADR — confirmed in the synthesis (SECURITY INVOKER functions under RLS per ADR 0022's scoping rules, Supabase-only new code, the existing coverage-manifest pattern).
  - **MVP readiness 70/100 (+1)** (Agent 4, accepted). Gap 1 now **~85% closed** (up from ~75% after Stories 1–2); Volunteer Scheduling module scored **84%** (up from 80%, judged generous while the picker and directory were empty in production). CI now runs `npm run test:db` in the `verify` job (previously a manual release-checklist step).
  - Verified: `npx tsc --noEmit` clean; `npx vitest run` (**1,754/1,754 passed**, 147 files); `npm run test:db` (**27 passed**); `npm run lint` (0 errors, 7 pre-existing warnings); `npm run test:surfaces` and `npm run lint:migrations` both pass; `npm run test:e2e:local` on the rotation journey plus every volunteers page × role (**42 passed**); `npm run build` passed inside the e2e runner.
  - **Follow-ups, not resolved on this branch** (owner-approved priority: FS3-1 first, before Story 4): **FS3-1 (High, adoption)** blockout-date entry — volunteer self-service from the member schedule page, plus admin entry in the directory; without it, "unavailable that day" only fires on seed data. **FS3-2 (Medium)** notify volunteers on assignment (auto-fill included), with an accept/decline link and a replacement suggestion after a decline. **FS3-3 (Medium)** a transactional `assign_volunteer_shift` RPC to close a narrow two-admins-applying-at-once race (a double-clicked Apply is already prevented). **FS3-4 (Medium)** church-timezone day bucketing — shifts, blocked dates and conflicts are UTC days today. **FS3-5 (Low)** share the 3-shifts-in-30-days rule between `lib/burnout-calculator.ts` and the planner, and align their windows. **FS3-6 (Low, competitive)** multi-week auto-scheduling, household "schedule with", and volunteer-set preferred frequency.
  - Full agent reports: [agent-1-database-api](docs/reviews/2026-09-26-council-review-19-agent-1-database-api.md), [agent-2-route-page](docs/reviews/2026-09-26-council-review-19-agent-2-route-page.md), [agent-3-ux-shell](docs/reviews/2026-09-26-council-review-19-agent-3-ux-shell.md), [agent-4-feature-competitive](docs/reviews/2026-09-26-council-review-19-agent-4-feature-competitive.md).

**Next:** see [§0](#0-mvp-roadmap-to-october-30-2026-tracker). As of 2026-09-26 that is milestone M1: blockout dates (G1.4) first, then the rest of gap 1. Everything in the former residual backlog here was triaged into §0.3 (a tracker row) or §0.5 (deferred, with a reason). Do not restart Sprint 2–7 framing from scratch: most of that scope already shipped under different names through the Council process.
