# ChurchCore Ops

ChurchCore Ops is a secure multi-tenant church operations platform focused on role-based portals, ministry administration, voluntary donations, a working calendar, volunteer coordination, guardrailed AI ministry tools, and graphical stewardship reporting. This private evaluation snapshot is aligned to `DEVELOPMENT_PLAN.md` v1.8 and is at release `2.12.1`, incorporating the Phase 1 product strategy work, Children's Church Ministry (CCM), Financial Management, Advanced Ministry Forge, Communications Hub, GDPR/CCPA data rights, and a fully operational local Supabase development environment with safe demo data.

## Stack

- Next.js 16 App Router with TypeScript
- Tailwind CSS v4
- Mantine UI as the standard UI framework for ChurchCore Ops surfaces
- Lucide React icons
- GitHub Actions for CI verification

Current plan target:

- Next.js App Router with TypeScript
- Tailwind CSS
- Mantine UI
- calendar tooling integrated into the Mantine shell
- separated control-plane and tenant data boundaries

## Current Plan Highlights

- Role-based portals with least-privilege enforcement for platform, church, ministry, and member workflows.
- The control plane and the tenant-facing church app are now explicitly different products with separate long-term data boundaries.
- Ministry Forge supports designated ministry leaders, and that leader assignment now feeds pastor-facing led-ministry visibility.
- Public portal entry can resolve a church from the request hostname, and member communication preferences now write append-only consent records.
- Core product scope spanning member directory, ministries, pastoral profiles, giving, reporting, communications, and leadership collaboration.
- Sprint 2 is now unblocked and focused on Admin Dashboard and Church Setup work.
- A working calendar hub remains core, now with explicit event categories defined in the development plan.
- An AI ministry tools suite that stays assistive only, requires consent, and never replaces prayer, Scripture study, or pastoral judgment.
- Security and privacy expectations centered on sensitive-data classification, consent, auditing, and disciplined application security checks.
- Future Ministry Forge work is now explicitly documented around specialized tracks for men, women, children, youth, young adults, marriage, education, missions, and outreach, with deterministic stewardship metrics and tighter safety/confidentiality rules.
- Future reporting work is now explicitly documented as a multi-surface reporting suite spanning members, events, giving, ministries, communications, and outreach, with graphical dashboards and differentiated stewardship insights.
- ShepherdAI for ChurchCore Ops is now implemented as an Ops-only, explainable workflow recommendation foundation that generates suggested ministry workflows from deterministic signals (no chatbot interface).

## ShepherdAI Ops Foundation

- Core module location: `lib/shepherd-ai/`
- Workflow operations module: `lib/ministry-workflows/`
- New church-admin workflow queue route: `/app/church-admin/workflows`
- Scheduled evaluation endpoint: `/api/cron/shepherd-ai`
- Data persistence tables: `ai_signals`, `ai_suggestions`, `workflows`, `workflow_actions`, `workflow_feedback`
- Product boundary: Ops-only data and logic; no Academy or Care cross-product inference

For recurring evaluation, configure `CRON_SECRET` and deploy `vercel.json` cron schedule.
The endpoint supports scoped runs with `tenantId` and bounded runs with `maxTenants`.
Hosted rollout reference: `docs/setup/hosted-shepherdai-rollout.md`.

See `docs/shepherd-ai-ops.md` for architecture and guardrails.

## Private Evaluation Snapshot

- Current repo version: `2.12.1`
- Intended use: private evaluation, invited collaboration, and local demo environments
- Included demo scope: preview mode without a backend, or local Supabase with seeded Grace Harbor Church data
- Current repo posture: local credential material is not committed; demo credentials are generated locally by the bootstrap script and saved to the gitignored `.demo-credentials.local`
- Security posture in repo: lint/build CI plus CodeQL, dependency review, and secret-scanning workflows for GitHub
- Evaluator helpers: `npm run setup:local`, `npm run smoke:preview`, and `npm run smoke:local`

## Application Guide

Start with `docs/application-guide.md` for the end-to-end product walkthrough: what ChurchCore Ops does, how each portal works, the main operator flows, the control-plane boundary, and what is still in progress.

For product readiness review, see `docs/mvp-readiness-audit.md`. It captures the current MVP verdict, navigation fit, UI fit, verification gaps, and the remaining readiness queue.

The in-app Daily Desk route is `/app/daily-desk`; it is the shared daily workspace for calls, notes, visits, calendar items, checkups, and operational signals. The ChurchAdmin readiness route is `/app/church-admin/readiness`; it is the guided weekly path for deciding whether a tenant is operationally ready.

## Release 2.12.1 Highlights

Release 2.12.1 hardens the ADR 0002 control-plane and tenant split. Backend configuration is now explicit per surface, and the completed split removes the shared local database fallback path from the active configuration.

- **Boundary-aware backend checks:** control-plane and tenant wrappers recognize either Supabase REST envs or direct DB fallback URLs as valid backend configuration.
- **Completed split posture:** control-plane registry tables live in the control-plane project only, and tenant runtime migrations remove the vestigial registry tables from the tenant project.
- **Current product baseline:** includes the 2.12.0 Phase 1 product strategy implementation: Small Groups, public giving, church-admin events, attendance tracking, Giving GL auto-posting, and first-time visitor workflow scaffolding.

## Release 2.11.1 Highlights

Release 2.11.1 packages the new **Children's Church Ministry (CCM)** module together with private-repo hardening for invited evaluation. The main product addition is the full child check-in and safety workflow; the repo addition is safer local bootstrap and stronger GitHub-side validation.

- **CCM module:** check-in and checkout kiosks, service dashboard, child profiles, emergency roster, volunteer coordination, custody restrictions, incidents, PIN/QR pickup verification, and seeded demo service data.
- **Private-repo hardening:** local fonts instead of live Google font fetches, env-driven local bootstrap, generated demo credentials, and removal of committed local token-shaped values from docs and seed metadata.

## Release 2.10.0 Highlights

Release 2.10.0 is the largest single feature release in the project's history. It ships two major system expansions simultaneously: a full church **Financial Management module** and an **Advanced Ministry Forge** that brings all ten ministry track kinds to full panel coverage with active Kingdom Stewardship metrics.

### Financial Management Module

Church admins now have a complete internal bookkeeping system at `/app/church-admin/finance`, independent of the existing Stripe donations flow. It is designed to satisfy 501(c)(3) annual reporting requirements, stewardship accountability, and annual audits.

**Database (`supabase/migrations/20260417000000_financial_management.sql`):**
Six new tables, all church-scoped with RLS enforced via `can_manage_church()` (church-admin only). All monetary values are stored as `amount_cents integer` — no floating point, consistent with the `donations` table.

- `finance_accounts` — hierarchical chart of accounts with `parent_id` self-reference for multi-level account trees (e.g. `5000 Expenses → 5100 Salaries → 5110 Pastoral Salaries`). Account type constrained to `asset`, `liability`, `equity`, `income`, or `expense`.
- `finance_journals` — journal batch records with `draft → posted → voided` status lifecycle. Tracks who posted and voided with timestamps.
- `finance_journal_lines` — individual debit and credit lines. The app layer validates `sum(debits) = sum(credits)` before any journal persists.
- `finance_budgets` — named budget versions per fiscal year with `is_active` flag.
- `finance_budget_lines` — per-account budgeted amount within a budget.
- `finance_imports` — import job log with filename, detected format, row counts, status (`pending → processing → completed / failed`), and error details.
- Audit triggers on `finance_journals` and `finance_accounts` write to `audit_log`.

**Data and actions layer:**

- `lib/finance-types.ts` — comprehensive shared TypeScript types: enums (`AccountType`, `JournalStatus`, `JournalType`, `ImportFormat`), entity types, report aggregates (`FinanceDashboardData`, `IncomeStatementData`, `BalanceSheetData`, `BudgetVarianceRow`), and import wizard types.
- `lib/finance-data.ts` — server-only data fetchers following the dual-path pattern (`shouldUseLocalTenantFallback()` → direct Postgres vs. Supabase REST). Functions: `getFinanceAccounts`, `getFinanceJournals`, `getFinanceJournalWithLines`, `getFinanceBudgets`, `getBudgetVariance`, `getFinanceImports`, `getFinanceDashboardData`, `getIncomeStatement`, `getBalanceSheet`, `getFinanceBudgetLines`.
- `app/app/finance-actions.ts` — role-guarded server actions: `createAccountAction`, `updateAccountAction`, `createJournalAction` (validates balance before insert), `postJournalAction`, `voidJournalAction`, `deleteJournalDraftAction`, `createBudgetAction`, `upsertBudgetLinesAction`, `importFinanceRowsAction`.
- `lib/finance-import.ts` — client-safe import parsers: CSV via `papaparse` with fallback, Excel `.xlsx`/`.xls` via `xlsx` library, QuickBooks IIF (tab-delimited `!TRNS`/`ENDTRNS` parser), OFX/QFX (SGML `<STMTTRN>` block extractor), and plain-text auto-detection. Format auto-detected from filename extension and content sniffing.

**Routes (11 new, all church-admin only):**
`finance/dashboard` · `finance/accounts` · `finance/accounts/[id]` · `finance/journals` · `finance/journals/new` · `finance/journals/[id]` · `finance/budgets` · `finance/budgets/[id]` · `finance/import` · `finance/reports`

**UI Components (7 new):**

- `finance-dashboard.tsx` — summary cards (total income, expenses, net position), `RingProgress` budget utilization, income/expense breakdown tables, recent journals table.
- `finance-accounts-workspace.tsx` — hierarchical chart of accounts grouped by type; add-account modal with type selector and parent account picker.
- `finance-journal-workspace.tsx` — journal list with `Badge` status indicators (draft / posted / voided) and journal type badges.
- `finance-journal-editor.tsx` — editable debit/credit line table with running balance display (green when balanced, red when not); read-only mode for posted/voided journals.
- `finance-budget-workspace.tsx` — budget list and line-by-line detail view showing budgeted, actual year-to-date, variance, and a heat-map color indicator per line.
- `finance-import-wizard.tsx` — four-step `Stepper`: file upload with auto-format detection → column mapping (CSV/Excel only) → 20-row preview with per-row error badges → completion with link to the created draft journal.
- `finance-reports-workspace.tsx` — tabbed reports: Income Statement, Balance Sheet, Budget Variance.

**Dependencies added:** `xlsx` (Apache-licensed Excel parsing), `papaparse` + `@types/papaparse` (robust CSV parsing with quoted-field support).

**ADR:** `docs/adr/0003-financial-management-module.md` documents the decision to build full double-entry accounting (rather than a simple expense tracker), the choice to add `xlsx` and `papaparse`, and the integer-cents monetary storage policy.

---

### Advanced Ministry Forge — 10 Specialized Track Panels

The Ministry Forge previously had dedicated management panels for worship, men's, women's, marriage, and missions. This release adds five more, expanding full panel coverage to all ten ministry track kinds. It also introduces stewardship-level metrics — Burnout Guardian, Discipleship Velocity, Safety Index — and schema-level security guardrails for sensitive ministry data.

**Database (`supabase/migrations/20260430000000_advanced_ministry_forge.sql`):**

Profile extensions: `profiles.member_number` (unique human-readable ID), `profiles.safety_clearance_date` (background check date for Children's Safety Index), `profiles.specialized_tags` (interest/career tags for life-stage and mentorship matching).

Ministry type expansion: `ministries.ministry_type` constraint updated to include `young_adult` and `education`.

New table groups by ministry kind:

- **Children's Ministry:** `children_rooms` (classroom definitions with capacity and `target_ratio`), `children_checkins` (per-service check-in/out log), `children_sensitive_data` (pickup codes, medical alerts, authorized guardians — `can_manage_church` RLS only, full audit trigger, Vault encryption noted for production).
- **Youth Ministry:** `youth_milestones` (milestone catalog per ministry — Baptism, First Serve, Faith Class, Student Leader), `youth_graduation_tracking` (per-student per-milestone completion with graduation year).
- **Young Adults Ministry:** `young_adult_career_mentorships` (career-kingdom mentor/mentee pairs with industry and focus area; status: `active`, `completed`, `paused`, `seeking`).
- **Education / Discipleship:** `education_courses` (course catalog with 10 constrained `curriculum_area` values), `education_enrollments` (per-member course enrollment with completion tracking).
- **Outreach Ministry:** `outreach_events` (community events with GPS coordinates, volunteer count, people served), `outreach_zones` (neighborhood heatmap summary with `coverage_level`: `low`, `medium`, `high`).
- **Marriage Ministry:** `marriage_pulse_entries` — completely anonymous weekly sentiment entries. **No `profile_id` column — anonymity is enforced at the schema level, not just by policy.**
- **Stewardship views:** `discipleship_velocity` (avg days from church join to first leader role), `burnout_category_counts` (members active in more than 3 distinct track kinds).

**Type system (`lib/ministry-forge-types.ts`):**

- `MinistryType` union and `TRACK_PANEL_TYPES` set are the single source of truth. Any addition propagates automatically to the data layer, dashboard, and list components.
- New data types for all five track kinds: `ChildrenRoomSafety` (with `ratioStatus: "safe" | "warning" | "alert"`), `YouthStudent` (with `readinessPercent` 0–100 and `alertLevel: "on_track" | "at_risk" | "critical"`), `CareerMentorship`, `MemberDoctrinalProgress` (with `coveragePercent`), `OutreachZone`, plus stewardship types `DiscipleshipVelocity` and `BurnoutCandidate`.

**Data layer (`lib/ministry-forge-data.ts`) — 7 new functions:**

- `getChildrenTrackData` — rooms, check-ins, background check status; computes `safetySnapshot[]` with real-time ratio alerts.
- `getYouthTrackData` — milestones and per-student tracking; computes `readinessPercent` and alert levels (critical when < 50% ready and graduation ≤ 1 year).
- `getYoungAdultTrackData` — mentorship pairs with names; derives `seekingMentors` list.
- `getEducationTrackData` — course catalog with enrollment/completion counts; per-member `coveragePercent` across curriculum areas.
- `getOutreachTrackData` — events and zone summaries; computes `totalVolunteerHours` and `totalPeopleServed`.
- `getDiscipleshipVelocity` — reads the `discipleship_velocity` view for stewardship reporting.
- `getBurnoutCandidates` — reads `burnout_category_counts` filtered to > 3 active track kinds.

**New UI components (5):**

- `ministry-track-children.tsx` — red alert banner when any room exceeds target ratio; safety index grid with color-coded `Progress` bars; background check expiry table; recent check-ins.
- `ministry-track-youth.tsx` — graduation readiness table sorted critical-first with `Progress` bars and alert badges; milestone catalog.
- `ministry-track-young-adult.tsx` — career–kingdom mentorship pairs table; seeking-a-mentor table; industry coverage stats.
- `ministry-track-education.tsx` — course catalog with curriculum area badges; doctrinal blueprint showing per-member theological coverage `Progress` bar and completed area badges.
- `ministry-track-outreach.tsx` — neighborhood density zone table with coverage level badges; low-coverage zone callout; event log.

Every new track panel component renders `AI_ASSISTIVE_DISCLAIMER` in its footer, consistent with the project-wide canonical disclaimer.

**Seed data:** `supabase/seed.sql` extended to 10 ministries with demo data for all 10 panel types — 22 profiles, 8 households, 5 children's rooms, 4 youth milestones, 4 career mentorship pairs, 7 education courses with enrollments, 5 outreach zones, 5 events with registrations, care assignments, giving records, communication logs, and 8 anonymous marriage pulse entries.

**Security guardrails:**

- Children's PII is in an isolated table (`children_sensitive_data`) with `can_manage_church` RLS and a write-audit trigger. No member role can read this data under any circumstance. The migration comments specify Supabase Vault (`pgsodium`) encryption before production deployment.
- Marriage pulse entries have anonymity enforced at the schema level — no `profile_id` column exists.
- Every track panel that surfaces AI-derived or computed stewardship data carries the canonical AI assistive disclaimer.

---

## Release 2.9.0 Highlights

- **Financial Management module.** Church admins now have a full double-entry accounting system at `/app/church-admin/finance`. Create a chart of accounts, post journal entries (draft → posted), set annual budgets with per-account lines, view actuals vs. budget, and import transactions from CSV, Excel, QuickBooks IIF, OFX/QFX bank feeds, or plain text. Financial reports include income statement, balance sheet, and budget variance.
- **Import wizard.** A multi-step wizard auto-detects file format, allows column mapping for CSV/Excel, previews rows with error flagging, and posts imported rows as a draft journal entry ready for review.
- **Access controls.** The finance module is church-admin only. All routes include role guards consistent with the existing pattern.

## Release 2.8.0 Highlights

- **Local Supabase fully operational.** Running `npm run setup:local` gives you a complete local environment with Grace Harbor Church, 22 profiles, 10 ministries, full Ministry Forge track data, operations data, giving data, events, and seeded CCM data. See `docs/setup/local-supabase.md` for the complete guide.
- **Ministry Forge Phase 4 — five specialized track panels.** Worship, men's, women's, marriage, and missions ministry types now each have a dedicated tab in the Ministry Forge dashboard, surfacing type-specific management data (song library, rehearsal schedule, mentorship pairs, discipleship groups, life-stage circles, support pairings, mentor couples, enrichment cohorts, mission partners, and trip roster with impact metrics).
- **Ministry Forge index page.** `/app/church-admin/ministry` now exists as a proper grid index showing all ministries with health-band indicators, type badges, member counts, and track-panel callouts. The previous nav link (which targeted a non-existent route) is fixed.
- **Three schema bugs fixed.** `platform_admins.user_id` and `church_memberships.user_id` FKs now correctly reference `auth.users(id)` instead of `profiles(id)`. The `audit_mentorship_pairs` trigger column name typo is corrected. All three fixes are applied as non-destructive migrations.
- **Preview mode fully populated.** All six demo ministries (one per track type) now show realistic stub data in preview mode — health history, kingdom impacts, and all five track panel tabs — without requiring a backend connection.

## Getting Started

Recommended runtime: Node `22.13.0` or newer.

```bash
npm ci
npm run dev
```

For automated verification beyond lint and build:

```bash
npm run test
npm run test:coverage
```

Open `http://localhost:3000`. The app runs in **preview mode** with no backend — all data is in-memory stubs.

Quick local evaluator path:

```bash
npm run setup:local
npm run dev
```

In another terminal:

```bash
npm run smoke:preview
npm run smoke:local
```

### Local Supabase (full backend)

For a fully operational local environment with real data:

```bash
npm run setup:local
```

Equivalent manual flow:

```bash
# 1. Start Docker, then:
npx supabase start

# 2. Apply all migrations and seed demo data:
npx supabase db reset && ./supabase/scripts/create-dev-users.sh
```

If you pull a new schema migration such as the CCM module, rerun the reset command before opening the new routes locally.

Your `.env.local` needs these four variables (use JWT-format keys from `npx supabase status --output env`):

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=eyJ...   # ANON_KEY from supabase status --output env
SUPABASE_SERVICE_ROLE_KEY=eyJ...              # SERVICE_ROLE_KEY from supabase status --output env
SUPABASE_DB_URL=postgresql://postgres:<local-db-password>@127.0.0.1:54322/postgres
```

> **Important:** Use the `eyJ…` JWT key, not the `sb_publishable_*` key shown in the default `supabase status` output. The JWT key comes from `npx supabase status --output env`.
> **Optional:** Set `CHURCHCORE_OPS_DEV_PASSWORD` before running `./supabase/scripts/create-dev-users.sh` if you want deterministic demo credentials. Otherwise the script generates a password and writes it to `.demo-credentials.local`.
> The generated credentials file also includes `CHURCHCORE_OPS_DEMO_ADMIN_EMAIL` and `CHURCHCORE_OPS_DEMO_MEMBER_EMAIL` for smoke-test automation.

**Dev accounts after seeding:**

| Email                         | Role                          |
|-------------------------------|-------------------------------|
| `sarah@churchcoreops.app`       | Church Admin + Platform Admin |
| `david@graceharbor.church`    | Member                        |

See `docs/setup/local-supabase.md` for the complete local setup guide.
For repository creation and GitHub-side hardening after the first push, use `docs/setup/private-repo-launch-checklist.md`.
For the application-specific route, action, and domain coverage map, see `docs/testing-schema.md`.

For voluntary donations (Sprint 7+), also supply:

- `STRIPE_SECRET_KEY` — Stripe secret key (`sk_live_…` or `sk_test_…`)
- `STRIPE_WEBHOOK_SECRET` — webhook signing secret (`whsec_…`) for payment confirmation
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — for Stripe Elements on the frontend
- When absent, donation actions return stub results so local dev is unaffected. ChurchCore Ops takes **no platform fees** — 100% of every donation goes directly to the church.

For Communications Hub (Phase 6), also supply:

- `SENDGRID_API_KEY` and `SENDGRID_FROM_EMAIL` — outbound email via SendGrid
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER` — outbound SMS via Twilio
- When these vars are absent the notification actions log to the console and return a stub result so local dev is unaffected.

Architectural note:

- ADR 0002 now makes separate control-plane and tenant databases the target architecture and the active configuration path.
- Control-plane registry data belongs in the control-plane project; church runtime data belongs in the tenant project.

For the current local Supabase development endpoints, setup steps, and local security notes, see `docs/setup/local-supabase.md`.

Primary routes:

- `/` marketing and product-direction overview
- `/sign-in` preview sign-in and protected-route entry
- `/control` platform control plane for ChurchCore Ops staff
- `/controll` compatibility redirect to `/control`
- `/app` tenant-facing church application entry
- `/app/[role]` church role workspace
- `/app/church-admin` church-admin home — live tenant summary cards for people, ministries, events, and giving plus operations lanes for live care, weekend, communications, and giving work
- `/app/calendar` tenant-facing working calendar hub backed by Supabase event reads when configured
- `/portal` public member-portal landing page with sign-in and request-access entry points
- `/portal/register` public member portal request form
- `/app/church-admin/settings` church-admin setup profile — tenant church name, legal name, timezone, website, contact, mailing address, and public summary
- `/app/church-admin/people` church-admin people-management — search, filter, household/account/request visibility, edit, role management, bulk update, add person (offline record), invite user (Supabase auth email), deactivate
- `/app/church-admin/accounts` church-admin account-request approval queue
- `/app/church-admin/events/[id]` event-specific attendance and roster workspace with quick check-in, burnout warnings, and visitor add flow
- `/app/church-admin/ministry` Ministry Forge index — grid of all ministries with health-band indicators, type badges, and member counts
- `/app/church-admin/ministry/[id]` Ministry Forge detail dashboard — health score, vision board, volunteer matcher, and type-specific track panel for all ten ministry kinds (worship, men's, women's, marriage, missions, children's, youth, young adults, education/discipleship, outreach)
- `/app/church-admin/finance` Financial Management hub — redirects to dashboard
- `/app/church-admin/finance/dashboard` Finance dashboard — income/expense summary cards, budget utilization, recent journals
- `/app/church-admin/finance/accounts` Chart of accounts — hierarchical account list grouped by type; add/edit accounts
- `/app/church-admin/finance/accounts/[id]` Account ledger — all journal lines for the selected account
- `/app/church-admin/finance/journals` Journal list — status badges (draft / posted / voided), journal type indicators
- `/app/church-admin/finance/journals/new` New journal entry — debit/credit line editor with live balance checker
- `/app/church-admin/finance/journals/[id]` Journal detail — edit draft lines, post, void, or view read-only
- `/app/church-admin/finance/budgets` Budget list — all budget versions by fiscal year
- `/app/church-admin/finance/budgets/[id]` Budget detail — per-account budgeted vs. actual vs. variance
- `/app/church-admin/finance/import` Import wizard — CSV, Excel, QuickBooks IIF, OFX/QFX, plain text
- `/app/church-admin/finance/reports` Financial reports — Income Statement, Balance Sheet, Budget Variance tabs
- `/app/reports` graphical reporting suite overview for pastor and church-admin
- `/app/reports/members` member intelligence dashboard with attendance, engagement, and drift reporting
- `/app/reports/events` event intelligence dashboard with turnout, staffing pressure, and visitor-touch reporting
- `/app/reports/giving` giving intelligence dashboard with fund, donor-journey, and generosity-mix reporting
- `/app/member/directory` member-facing directory route
- `/app/member/family` member-facing household route
- `/app/member/ministries` member-facing ministry assignments route
- `/app/pastor/people` pastor-facing people route with the initial pastoral-care workflow
- `/app/elders/discernment` Elders Discernment Room — pastor-only private session and notes workspace
- `/app/elders/discernment/[sessionId]` per-session prayer wall, elder notes, and AI Wisdom Prompt
- `/app/council/forge` Pastor Council Forge — versioned collaborative notes for pastor and church-admin
- `/app/communications` Communications Hub — consent-aware email/SMS broadcast for pastor and church-admin
- `/app/member/giving` member donor portal — giving history, active recurring, Give drawer (voluntary, anonymous option)
- `/app/member/data-rights` member data rights — GDPR/CCPA export and deletion request
- `/app/giving` giving reporting dashboard for pastors and church-admins (fund breakdown, totals, recurring count)
- `/control/launch-checklist` interactive pre-launch checklist for platform operators (47 items across 8 sections)
- `/workspace` compatibility redirect to the new split entry
- `/calendar` compatibility redirect to the new split entry
- `/plan` development-plan summary
- `/adr/backend-platform` backend ADR summary

## Scripts

- `npm run dev` starts the local development server.
- `npm run lint` runs ESLint across the repo.
- `npm run build` creates the production build.
- `npm run start` serves the production build locally.
- `npm run check` runs lint plus production build.

## Project Structure

```text
app/                  Next.js App Router entrypoints, layouts, and pages
components/           Shared UI primitives plus marketing and application components
docs/                 Architecture notes, ADRs, and feature documentation
lib/                  Shared utilities, site configuration, and portal mock data
lib/supabase/         Supabase SSR client and configuration helpers
supabase/             SQL migrations and backend foundation assets
public/               Static assets
.github/workflows/    CI automation
```

## Current Application Surface

- The landing page is now a minimal entry surface instead of a feature-heavy marketing preview.
- The sign-in route is intentionally minimal and now chooses the control-plane or tenant Supabase auth surface from the requested redirect target, with preview auth retained only as a local fallback.
- The control-plane routes provide a protected platform-operator surface for tenant lifecycle, billing, support, and provisioning.
- The church-app routes provide protected role-based portals for ChurchAdmin, Pastor / Elder, MinistryAdmin / Leader, and Volunteer / Member flows.
- Auth sessions now resolve an explicit app context from control-plane access plus church membership data, so actor identity and active product surface are no longer conflated.
- The backend access layer is now split in code between control-plane and tenant wrappers under `lib/supabase/control-plane.ts` and `lib/supabase/tenant.ts`, with the old single-project local Supabase setup retained only as transitional fallback.
- Shared Supabase helper boundaries are now explicit as well: browser/SSR helpers require a named surface, and local direct-DB fallback pooling lives only behind the control-plane or tenant wrappers instead of a generic shared pool.
- `proxy.ts`, `/sign-in`, and session hydration now refresh and resolve auth against explicit surface-aware Supabase clients instead of a generic shared selector, which keeps `/control` and `/app` aligned to ADR 0002 even while shared local env vars remain supported.
- Tenant launch from `/control` is now registry-driven, with the control plane resolving the tenant runtime target through `tenants` and `tenant_connections` before entering `/app`.
- Control-plane routing now resolves the tenant runtime church target from `tenant_connections.metadata.runtime_church_id`, which keeps platform tenant IDs separate from tenant-runtime church IDs.
- Platform admins can now launch an explicit tenant view from the control plane and return to ChurchCore Ops Control without implicit cross-over.
- When Supabase is configured, the control plane now reads live church and membership counts plus recent tenant-view audit events from database records instead of relying only on mock tenant lists.
- Local development can now fall back to direct Postgres reads and writes for app-owned Supabase tables when the local REST schema cache is unavailable.
- The church app session now hydrates from real `profiles` rows when available, so `/app` and the app shell resolve live church-scoped user data instead of relying only on preview profile templates.
- The member portal under `/app/member` now reads real profile, ministry-assignment, and upcoming-event data from Supabase instead of using only the generic preview workspace.
- Tenant membership reads now resolve from the active church-scoped `profiles.id`, which keeps member and ministry data aligned across merged-profile cleanup, local SQL fallback, and live Supabase relation reads.
- The church-admin side now includes a real `/app/church-admin/people` screen for church-scoped record management and status updates.
- ChurchAdmin people management now includes bulk updates for membership status, directory visibility, and contact permission across selected records.
- ChurchAdmin people management now includes household reassignment and duplicate-profile merge tooling, with merged profiles retired from downstream member and pastor views.
- The church-admin side now includes `/app/church-admin/accounts` for reviewing public portal requests, approving them with generated member numbers, and sending member invites when the tenant service-role key is configured.
- The church-admin and pastor flows now include `/app/church-admin/events/[id]`, an event-specific attendance and roster workspace with quick check-in, visitor capture, roster confirmation, and seven-day burnout warnings.
- The church-admin events list now shows live roster counts in both direct SQL fallback mode and the normal Supabase tenant path.
- Tenant write actions for calendar events, event rosters/check-ins, registration settings, and ministry membership now explicitly validate church ownership on incoming record IDs before writing, instead of relying on implicit downstream constraints alone.
- Church leadership roles now also have `/app/reports`, `/app/reports/members`, `/app/reports/events`, and `/app/reports/giving`, a first reporting-suite foundation with graphical stewardship dashboards and preview-safe fallback behavior.
- The churchgoer portal now has a public `/portal` landing page plus `/portal/register`, where prospective members can request portal access and be linked to an existing profile by email when possible.
- The member experience is now split further into dedicated directory and household routes, and the main member home now includes attendance history, upcoming serving assignments, and interest / contact-preference self-service.
- The pastor role now resolves to a pastor-specific workspace backed by tenant profile, ministry, and follow-up data instead of the generic role shell.
- The pastor experience now includes a dedicated people view with search, status filtering, household context, contact visibility, and last-attendance signals.
- The pastor people route now includes a first pastoral-care workflow with pastor-only notes, church-scoped care assignments, and assignment status updates.
- The protected shell now uses a light-only Mantine direction with less chrome, less copy, and a simpler hierarchy across control-plane and church-app surfaces.
- The protected shell now exposes an explicit visible logout action in the header instead of hiding sign-out only inside the profile menu.
- The current UI direction is now formally documented in `docs/UI-UPDATES.md`, with a blue-neutral palette, higher-contrast hierarchy, and dark mode intentionally deferred until token work is complete.
- The pastoral-care workflow is documented in `docs/pastoral-care-foundation.md` so future confidentiality and governance work has a concrete baseline.
- The church-app calendar route now reads live categorized `events` rows from Supabase and presents them as a simple upcoming-events board with category filters and a detail drawer.
- Church management roles can now create, edit, and delete categorized events from the tenant calendar route, and all church users can persist RSVP responses against live `event_rsvps` rows.
- The tenant calendar now renders full Month, Week, and Day calendar views with an event-kind filter that can target a single category or show all categories.
- The ChurchAdmin workspace uses segmented operation lanes with slide-over detail drawers, while the heavier preview metrics and promo-style copy have been removed.
- The repo now includes Supabase SSR auth foundations, a root proxy, and an initial SQL schema scaffold for multi-tenant church data.
- Preview auth remains available only as a fallback when Supabase environment variables are not configured locally.
- Ministry Forge (Phases 1–3) adds per-ministry health scoring, vision boards, scriptural anchors, kingdom impact logging, and a rule-based AI Volunteer Matcher with human-gated approve/reject and a Burnout Guardian.
- The Elders Discernment Room at `/app/elders/discernment` is a pastor-only workspace with open/prayer/voting session tracking, a per-session prayer wall with "I Prayed" acknowledgements, elder notes with confidentiality controls, and a theological guardrail AI Wisdom Prompt that surfaces Scripture and reflection questions only — never decisions.
- The Pastor Council Forge at `/app/council/forge` provides versioned collaborative notes (auto-incrementing version on each save) across five note types: general, sermon outline, series plan, council minutes, and sabbath reflection.
- The Communications Hub at `/app/communications` enables pastors and church-admins to compose and broadcast email or SMS to congregation members, with per-member consent checking via `notification_preferences`, full `communication_logs` audit trail, and graceful local-dev stubs when SendGrid/Twilio are not configured.
- The member portal bottom nav now includes a Ministries tab alongside Home, Calendar, Directory, and Family, with all five routes pre-cached by the service worker for offline access.
- The voluntary donations system at `/app/member/giving` lets members give one-time or recurring gifts with fund designation and anonymous option. ChurchCore Ops takes no platform fee — 100% goes to the church. Receipt emails sent via SendGrid.
- Members can download a full JSON export of their personal data or request account deletion with a 30-day grace period from `/app/member/data-rights` (GDPR/CCPA aligned).
- Pastors and church-admins have a giving reporting dashboard at `/app/giving` with fund breakdown, monthly and all-time totals, and recurring-gift counts. Anonymous donations are never de-anonymised in the UI.
- Platform operators have a `/control/launch-checklist` with 47 interactive verification items across RLS, donations, AI guardrails, communications, data rights, security, mobile/PWA, and role access.
- Church admins now have a full double-entry accounting system at `/app/church-admin/finance` for internal bookkeeping, 501(c)(3) reporting, and annual audits. The finance module is isolated from Stripe donations and is accessible to the church-admin role only. It includes a chart of accounts, journal entries (draft → posted → voided), annual budgets with per-account lines, actuals vs. budget reporting, a multi-step import wizard supporting CSV/Excel/QuickBooks IIF/OFX/QFX, and three financial report views.
- Ministry Forge now covers all ten ministry track kinds with dedicated management panels. In addition to the original five (worship, men's, women's, marriage, missions), v2.10.0 adds: Children's (safety index with real-time ratio alerts, background check expiry tracking, check-in log), Youth (graduation readiness tracker with milestone-completion progress), Young Adults (career-kingdom mentorship map), Education (doctrinal blueprint showing per-member theological coverage), and Outreach (neighborhood density heatmap and event log). Stewardship metrics include Discipleship Velocity (avg days to first leader role) and Burnout Guardian (members active across > 3 track kinds).
- Children's sensitive data (pickup codes, medical alerts, authorized guardians) is stored in an isolated table with `can_manage_church`-only RLS and a write-audit trigger. Marriage pulse entries are schema-level anonymous — no profile ID column exists. All new track panels carry the canonical AI assistive disclaimer.

## Documentation Discipline

Every significant change must keep these files current:

- `README.md`
- `CHANGELOG.md`
- `DEVELOPMENT_PLAN.md`
- `docs/UI-UPDATES.md` for visual-system decisions
- Relevant feature or architecture docs in `docs/`

Current tracked follow-up:

- See `docs/plans/reporting-implementation.md` for the reporting-suite implementation plan covering member, event, giving, ministry, communications, outreach, and executive dashboards.
- See `docs/plans/ministry-spec.md` for the repo-level ministry source-of-truth and doc index for Ministry Forge planning.
- See `docs/todo.md` for the remaining Supabase project hookup steps.
- See `docs/church-admin-people.md` for the current ChurchAdmin people-management scope.
- See `docs/church-admin-workspace.md` for the current ChurchAdmin operations, accounts, and event-management scope.
- See `docs/sprint2-attendance-identity-flow.md` for the detailed Sprint 2 engineering description covering schema, routes, actions, and current constraints.
- See `docs/advanced-ministry-forge-research-spec.md` for the reconciled engineering direction for specialized ministry tracks, stewardship metrics, children safety, mentorship visibility, and confidentiality guardrails.
- See `docs/setup/local-supabase.md` for the complete local Supabase setup guide, dev account credentials, seeded demo data reference, and troubleshooting.
- See `docs/plans/advanced-ministry-elders-pastor.md` for the advanced ministries, elders, and pastor-council feature direction.
- See `docs/plans/churchgoer-data.md` for the churchgoer data and self-service portal source of truth.
- See `docs/churchgoer-pastor-execution-plan.md` for the current execution sequence across churchgoer and pastor data work.
- See `docs/pastoral-care-foundation.md` for the current pastoral notes and care assignment scope.
- Phase 6 Communications Hub requires `SENDGRID_*` and `TWILIO_*` env vars for live sends; see `.env.example` for the full list.

## GitHub Workflow Discipline

- Feature and bug issues should cite the relevant `DEVELOPMENT_PLAN.md` sections before implementation starts.
- Pull requests should explain plan alignment, validation performed, and any security, AI, or sensitive-data implications.
- Use the checked-in templates in `.github/` so planning and review stay consistent with the development plan.

## Architecture Notes

- ADR 0001 is now accepted in favor of Supabase with Postgres, Auth, Realtime, and Storage.
- ADR 0002 is now accepted in favor of separating control-plane and tenant data boundaries, including separate databases.
- The current repo establishes the frontend shell, Supabase SSR auth foundation, boundary-aware control-plane and tenant data access wrappers, member portal, live calendar read path, initial multi-tenant schema scaffold, design system baseline, and release discipline expected for future feature work across RBAC portals, ministry operations, calendar workflows, and AI-assisted features.

## CI

The repository includes a GitHub Actions workflow that installs dependencies, lints, and builds on pushes and pull requests.
