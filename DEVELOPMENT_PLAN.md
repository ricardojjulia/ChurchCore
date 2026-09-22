# ChurchCore Development Plan

**Living Document** - Last Updated: September 20, 2026
**Version**: 2.1
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

## Current Status (2026-09-17)

This plan's sprint table above (§8) describes the original roadmap shape, not current delivery — actual work has run far past a linear Sprint 1→7 sequence via the Council Review protocol (`improve-software.md`, `docs/reviews/`). Treat the sprint table as historical framing, and this section as the accurate snapshot:

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

- **Error boundaries, finance batch-commit test coverage, and the `/app/member` question closed; Council Review 13 (`fix/error-boundaries-finance-tests-member-route`, 2026-09-20):** closed the three smaller backlog items Council Review 12 left open in its "Next" line.
  - Three scoped `error.tsx` route-segment boundaries added — `app/app/error.tsx`, `app/portal/error.tsx`, `app/control/error.tsx` — each delegating to a new shared `components/application/page-error-boundary.tsx` (`PageErrorBoundary`) that reports to Sentry (`Sentry.captureException`, same pattern as `app/global-error.tsx`) and offers a Mantine `Alert` + "Try again" button wired to Next's `reset()`. Mirrors the `PageLoadingSkeleton`/`loading.tsx` convention already wired at these same three roots (Council Review 12). New tests in `components/application/page-error-boundary.test.tsx` (2 tests: Sentry reporting on mount, `reset()` called on click).
  - Test coverage added for `importFinanceRowsAction`'s batch-commit/journal-posting workflow in `app/app/finance-actions.test.ts` (new `describe("importFinanceRowsAction batch commit")`, 3 tests: local-fallback-mode commit, Supabase-path commit, debit/credit account-code resolution), each asserting the exact `finance_journal_lines` rows a committed import produces (account id, side, amount_cents, sort_order) — distinct from the finance-import *parsers*, which already had 27 tests from Council Review 12.
  - The standing "`/app/member` 404 risk" question (opened Council Review 11, investigated Review 12) is now closed by direct confirmation: `app/app/[role]/page.tsx` is a dynamic catch-all that renders `MemberPortalHome` when `params.role === "member"`. No code change was needed — a documentation close, not a fix.
  - **Council Review 13** (`docs/reviews/2026-09-20-council-review-13-synthesis.md`): diff-scoped (this branch's footprint is narrower than Review 12's — no RLS/migration/shared-shell changes, just three new route files and one new shared component), all four agents confirm no blockers. During synthesis, Agents 3 and 4 initially restated Review 12's "finance batch-commit/GL-posting gap" as still open, and Agent 4 additionally asserted a nonexistent "GL auto-posting background process." Agent 1 read the source directly — `postJournalAction` only flips `finance_journals.status` from `draft` to `posted`; no cron or background process touches finance journals or journal lines anywhere in the codebase (the only GL-adjacent background path, `donation_gl_posts`, belongs to the unrelated Stripe-donation flow) — and Agent 4 reviewed that finding and retracted its claim in its own report before synthesis finalized. Resolved: the gap is fully closed, not partially closed. This is a fresh instance of the standing `feedback_council_synthesis_scrutiny` memory lesson (an agent's own narrative claim needs source verification, not repetition) — the new twist is it was caught *during* synthesis by another agent, not after the fact by the Documenter. No ADR needed — confirmed independently by all four agents (existing-convention reuse only: Sentry+Mantine error UI, the existing action-test mocking pattern). MVP readiness reconfirmed **65/100 for a fifth consecutive round** (Reviews 9–13); RLS remains 114/114 `church_id`-bearing tables, unchanged since Review 12 (this branch adds no migrations). Verified on the implementation commit (rewritten post-review from `6279671` to `0c6d003` to fix an `unverified_email` placeholder-address issue caught during Documenter close-out — see below; content unchanged, byte-identical diff): `npm run lint` (0 errors, 7 pre-existing unrelated warnings, unchanged baseline), `npm run build` (all routes clean), `npx vitest run` (**1452/1452 passed**, 127 test files — up from 1447 at Review 12, reflecting this branch's 5 new tests: 2 in `page-error-boundary.test.tsx`, 3 in `finance-actions.test.ts`). Full agent reports: [agent-1-database-api](docs/reviews/2026-09-20-council-review-13-agent-1-database-api.md), [agent-2-route-page](docs/reviews/2026-09-20-council-review-13-agent-2-route-page.md), [agent-3-ux-shell](docs/reviews/2026-09-20-council-review-13-agent-3-ux-shell.md), [agent-4-feature-competitive](docs/reviews/2026-09-20-council-review-13-agent-4-feature-competitive.md).

**Next**: proceed to Story 2 (Role Taxonomy & Team Roster) of the 5-story Service Planning split — Story 1 (song library & setlist builder, Council Review 14) is done; Stories 3–5 (rotation planner, rehearsal scheduling, and the precondition schema change making `event_id` required on `service_plans`) remain queued behind it. The other Phase B blockers — mobile UX, recurring giving, migration tooling, provider breadth — are reconfirmed unchanged; service planning itself stays ranked #1 until the remaining stories land, since Council Review 14 judged this only a partial (~60%) close of that gap, not a full one. Residual, non-blocking backlog carried forward: nested route-segment `error.tsx` below `app/app`/`app/portal`/`app/control` and the still-unverified nested-`loading.tsx` gap in deeper member subroutes (both unchanged since Review 12/13); a pre-existing `SimpleGrid cols={3}` mobile-breakpoint issue at `volunteer-schedule.tsx:1402` (surfaced by Council Review 14, confirmed pre-existing and outside this branch's diff); `lib/stripe/*` and `lib/volunteer-data.ts` remain untested (pre-existing, surfaced again by Council Review 14). Do not restart Sprint 2–7 framing from scratch — most of that scope has already shipped under different names via the Council process.
