# ChurchCore Development Plan

**Living Document** - Last Updated: May 26, 2026
**Version**: 2.0
**Purpose**: This is the single source of truth for all ChurchCore development. Every GitHub Issue, PR, sprint, and code review must reference this document. Update only via PR.

Visual companion: [docs/development-plan-visual.md](docs/development-plan-visual.md) summarizes the strategy, roadmap, boundary model, and Sprint 1 flow as diagrams. This document remains the source of truth.

## Table of Contents

- [1. Project Vision & Scope](#1-project-vision--scope)
- [2. User Roles & Portals](#2-user-roles--portals)
- [3. Core Features](#3-core-features)
- [4. AI Ministry Tools Suite](#4-ai-ministry-tools-suite)
- [5. Events, Calendar & Volunteer Management](#5-events-calendar--volunteer-management)
- [6. Technology Stack](#6-technology-stack)
- [7. Security, Privacy & Compliance](#7-security-privacy--compliance)
- [8. Sprint Roadmap](#8-sprint-roadmap)
- [9. Detailed Sprint 1 - Foundation & Member Portal](#9-detailed-sprint-1---foundation--member-portal)
- [10. SDLC & Development Processes](#10-sdlc--development-processes)
- [11. GitHub Discipline & Code Quality](#11-github-discipline--code-quality)
- [12. How to Use This Plan](#12-how-to-use-this-plan)

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

**Next Sprint**: Sprint 2 — Admin Dashboard and Church Setup — is now unblocked.
