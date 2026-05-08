# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog and this project follows Semantic Versioning.

## [Unreleased]

### Unreleased — Added

- Added `supabase/control-plane/` as the dedicated Supabase project directory for control-plane concerns (tenant registry, billing metadata, platform staff identity, tenant-view audit trail). Includes `config.toml` with separate ports (API 54331, DB 54332) to allow both projects to run locally without conflict, a clean schema migration (`20260424000000_control_plane_schema.sql`) with no cross-database FK constraints, and a local development seed.
- Added `supabase/migrations/20260425010000_drop_control_plane_tables_from_tenant.sql` to remove vestigial control-plane registry tables from the tenant runtime project now that ADR 0002 is complete.
- Added `docs/plans/ui-stack-migration.md` as a deferred Mantine-to-Tailwind/shadcn/Base UI migration plan.
- Added the first Sprint 2 church setup surface at `/app/church-admin/settings`, backed by tenant-scoped church profile fields and a church-admin-only update action.
- Added `supabase/migrations/20260506000000_church_settings_profile.sql` for church legal name, website, contact, mailing address, and public summary metadata.
- Added ChurchAdmin role management in the people edit drawer, including profile role sync, auth membership sync for linked users, self-demotion protection, and audited `church_memberships` writes.
- Added `supabase/migrations/20260506010000_audit_church_membership_role_changes.sql` to capture role membership changes in `audit_log`.
- Added live tenant summary cards to the ChurchAdmin home dashboard for people, ministries, events, and giving, with preview fallback when no backend is configured.
- Added a live event-derived Weekend operations lane on the ChurchAdmin home dashboard, surfacing upcoming events that need approval, roster, waitlist, capacity, or near-term attention.
- Added a live Communications operations lane on the ChurchAdmin home dashboard, surfacing queued/scheduled sends, failed/bounced logs, and aggregate consent/contact gaps.
- Added a live Giving operations lane on the ChurchAdmin home dashboard, surfacing payment exceptions, unsent receipts, GL reconciliation gaps, fund mapping gaps, and public giving page setup.

- Added local evaluator helpers: `npm run setup:local`, `npm run smoke:preview`, and `npm run smoke:local`, backed by `supabase/scripts/setup-local.sh` and `supabase/scripts/smoke-demo.sh`.
- Added `.github/CODEOWNERS` with the current repository owner to make review ownership explicit from the first push.
- Added a Vitest-based test harness with `npm run test`, `npm run test:watch`, and `npm run test:coverage`.
- Added first-pass executable coverage for shared utility logic, finance import parsing, and member bottom navigation.
- Added `docs/testing-schema.md` to map the current route, action, data, and component surface to required unit, integration, smoke, and security tests.
- Added server-action integration suites for `app/sign-in/actions.ts`, `app/app/giving-actions.ts`, `app/app/groups-actions.ts`, and `app/app/finance-actions.ts`, including role-gate, validation, and fallback branch coverage.
- Added server-action integration suites for `app/app/church-admin-actions.ts` and `app/app/ccm-actions.ts`, covering authorization, registration/attendance flows, schema fallback handling, and critical revalidation paths.
- Added server-action integration suites for `app/app/donations-actions.ts` and `app/app/volunteer-actions.ts`, covering donation lifecycle behaviors, receipt/cancellation flow, volunteer scheduling conflicts, and member response handling.
- Added route execution tests for `app/sign-in/page.tsx`, `app/app/member/giving/page.tsx`, `app/app/church-admin/volunteers/schedules/page.tsx`, and `app/app/church-admin/children/dashboard/page.tsx` to verify auth redirects, state wiring, and high-value screen rendering.
- Added designated ministry leader assignment to Ministry Forge settings, including roster sync to `profile_ministries` and pastor led-ministry visibility driven by `ministries.leader_profile_id`.
- Added host-aware public portal church resolution via middleware cookie + request host parsing, so `/portal` and `/portal/register` can auto-select the church when entered from a tenant hostname.
- Added append-only consent logging for member privacy/contact preference changes and per-channel communication preference changes.
- Added surface-aware Supabase auth routing and verification so `/control` prefers control-plane auth while `/app` and `/portal` prefer tenant auth, with explicit fallback order coverage in `lib/supabase/config.test.ts`.
- Added ShepherdAI Ops foundation migration (`20260505000000_shepherd_ai_ops_foundation.sql`) with deterministic signal and workflow persistence tables: `ai_signals`, `ai_suggestions`, `workflows`, `workflow_actions`, `workflow_feedback`.
- Added Ops-only ShepherdAI services under `lib/shepherd-ai/` for signal aggregation, concern scoring, context building, workflow recommendation, explainability, optional faith support, optional message draft generation, and scheduled evaluation jobs.
- Added ministry workflow management service under `lib/ministry-workflows/` with create, assign, defer, dismiss, complete, feedback, and action-log support.
- Added church-admin workflow queue route `/app/church-admin/workflows` with filtering, suggestion promotion, assignment, defer, dismiss, complete, and feedback capture.
- Added Ministry Forge dashboard widget for Suggested Ministry Workflows and member-level ShepherdAI insights in church-admin people cards.
- Added ShepherdAI unit and integration tests for signal normalization, scoring, recommendation guardrails, scheduled evaluation flow, workflow promotion, and queue data retrieval.
- Added architecture and guardrails documentation in `docs/shepherd-ai-ops.md`.
- Added recurring ShepherdAI scheduler wiring with `lib/shepherd-ai/scheduler.ts`, secure cron route `GET /api/cron/shepherd-ai`, and `vercel.json` cron schedule support.

### Unreleased — Changed

- Rebranded the product to ChurchCore Ops across the application shell, public metadata, documentation, demo domains, and local automation naming.
- `create-dev-users.sh` now writes shell-compatible demo credential metadata into `.demo-credentials.local`, including admin/member email variables for local automation.
- README and local setup docs now point evaluators to the setup/smoke helpers and the post-create GitHub hardening checklist.
- Reorganized the repo documentation tree by moving setup guides into `docs/setup/` and long-form planning documents into `docs/plans/`, which removes document clutter from the repository root and keeps the root focused on active repo controls.
- README now documents the new automated test commands and links the application-specific testing schema.
- Ministry Forge list/detail views now surface the designated leader, and ministry settings accept the full set of current ministry track types.
- Member portal home now prompts first-time communication preference setup and surfaces the notification preference form directly in the member experience.
- `/sign-in`, `/auth/confirm`, `proxy.ts`, and session hydration no longer depend on a generic Supabase client selector; control-plane self-sign-up is now blocked so the control surface does not route through tenant confirmation flows.
- The remaining generic Supabase helper drift is tightened further: shared SSR/browser helpers now require an explicit surface argument, tenant confirmation uses the tenant-specific wrapper directly, and stale shared local-DB pooling helpers have been removed in favor of control-plane and tenant-specific boundaries.
- Tenant member and ministry loaders now resolve memberships through the active church-scoped profile, exclude merged profiles from active profile hydration, and keep live church-admin event roster counts aligned between local SQL fallback and Supabase-backed reads.
- Calendar, church-admin event, and ministry write actions now verify that incoming `event_id`, `ministry_id`, `profile_id`, `roster_id`, and registration targets belong to the active church before mutating tenant data, and public event registration now derives church ownership from the event instead of trusting client-supplied church IDs.
- Control-plane and tenant backend availability checks now treat direct Postgres fallback URLs as configured backends, so local split-database paths are not bypassed before their fallback reads or writes can run.
- Church-admin ministry navigation now includes the dedicated workflow queue and surfaces Ops-only suggested ministry workflows without introducing any chatbot UI pattern.
- `DEVELOPMENT_PLAN.md` now records ADR 0002 as complete and marks Sprint 2 — Admin Dashboard and Church Setup — as unblocked.
- `docs/todo.md` now points at Sprint 2 execution and operational split-backend follow-up instead of completed ADR provisioning work.
- Control-plane and tenant direct database fallback helpers now require their explicit surface-specific DB URLs; the previous shared `SUPABASE_DB_URL` fallback path has been removed.
- Church-admin navigation now includes a Settings entry for the new church setup profile.
- Church-admin person updates now manage application roles alongside membership status and contact/profile fields.
- ChurchAdmin home now reads aggregate tenant data instead of relying only on static preview spotlight cards.
- The ChurchAdmin Care lane now links live pastoral care assignment work to people records while preserving preview behavior when live tenant data is unavailable.
- The ChurchAdmin Weekend lane now links actionable event items directly to `/app/church-admin/events/[id]` and keeps preview checklist behavior when live tenant data is unavailable.
- The ChurchAdmin Communications lane now links live communication work to `/app/communications` or people records while preserving preview behavior when live tenant data is unavailable.
- The ChurchAdmin Giving lane now links live giving work to giving and finance routes while preserving preview behavior when live tenant data is unavailable.
- Added focused admin write-action coverage for church settings validation, profile bulk status updates, role-change protection, and portal account request approval/rejection.
- ChurchAdmin people management now surfaces member numbers, account status, pending portal request counts, account-state filtering, and a direct path back to the account approval queue.
- ChurchAdmin people management now surfaces unassigned-household counts, household-state filtering, and per-person household badges that link naturally into the existing relationship reassignment flow.
- Fixed remaining stale Ministry Forge links and added a compatibility redirect from `/app/church-admin/ministry/overview` to `/app/church-admin/ministry`.

### Unreleased — Fixed

- Fixed ShepherdAI scheduled evaluation in hosted cron context by using tenant admin client reads/writes when no user session is present, preventing zero-entity evaluations under RLS.
- Fixed local direct-DB fallback detection for control-plane and tenant loaders that previously checked only Supabase REST configuration before returning preview or empty data.
- Fixed the giving dashboard analytics tab placement so the conditional `Tabs.Panel` remains inside the Mantine `Tabs` root.
- Replaced vulnerable `xlsx` dependency with `read-excel-file` for finance import parsing to remove unresolved high-severity advisories on SheetJS.
- Added direct `postcss@^8.5.10` dependency and documented temporary risk acceptance for the transitive Next.js-postcss advisory pending an upstream Next.js patch.
- Fixed ShepherdAI ops integration test expectation to match the updated repository method signature that forwards optional evaluation options.

---

## [2.12.0] - 2026-04-17

### Overview

Release 2.12.0 ships **Phase 1 of the ChurchCore Ops product strategy** — closing the critical feature gaps between ChurchCore Ops and Planning Center. This release adds the Small Groups module (completely new), Giving GL auto-posting, a public-facing giving page, a complete Events directory with create flow, service attendance headcount tracking, first-time visitor workflow scaffolding, and navigation updates across all roles.

### Added

#### Small Groups Module (`supabase/migrations/20260502000000_groups_module.sql`, `lib/groups-types.ts`, `lib/groups-data.ts`, `app/app/groups-actions.ts`)

- **Database**: five new tables — `groups`, `group_members`, `group_meetings`, `group_attendance`, `group_resources` — all with `church_id` FK, RLS, and audit-capable structure.
- **Group directory**: church-admin and pastor can create, edit, activate/deactivate groups with category, meeting day/time/location, capacity, and open/closed status.
- **Group membership**: role-based (leader, co-leader, member); member join requests (status: pending until approved); leader assignment.
- **Meeting logging**: create meeting records with date, location, notes; attendance tracking per meeting (present/absent/excused).
- **Member-facing browse**: members see all open groups, can request to join via bottom nav → Groups.
- **Admin routes**: `/app/church-admin/groups`, `/app/church-admin/groups/[id]`
- **Member routes**: `/app/member/groups`

#### Giving GL Auto-Posting (`app/app/giving-actions.ts`)

- `upsertFundMappingAction` — maps a fund designation to asset + income GL accounts.
- `postDonationToGlAction` — creates a balanced journal entry (debit asset, credit income) for a succeeded donation; records to `donation_gl_posts` audit table; idempotent (duplicate post blocked).
- `upsertGivingPageAction` — manage public giving page configuration.
- **New tables** (in migration): `giving_fund_accounts`, `donation_gl_posts`, `public_giving_pages`.

#### Public Giving Page (`app/give/[slug]/page.tsx`, `components/application/public-giving-page.tsx`)

- Public route at `/give/[churchSlug]` — no authentication required.
- Fund selection, one-time / weekly / monthly frequency, preset amounts, anonymous option.
- Stripe Elements integration scaffold — wired to receive Stripe PaymentIntent client secret; submission UX complete.
- Thank-you confirmation state after successful gift.

#### Events Module (list + create)

- **`lib/church-admin-events-data.ts`**: added `getChurchAdminEventsList` function — returns all church events sorted by date with roster count.
- **`app/app/church-admin/events/page.tsx`**: events directory with upcoming/past tabs.
- **`components/application/church-admin-event-workspace.tsx`**: added `EventsListWorkspace` component — table view with upcoming/past tab, create event modal.
- **`app/app/church-admin-actions.ts`**: added `createEventAction` — inserts into `events` table, returns new event ID for redirect.

#### Attendance Tracking (`app/app/church-admin/attendance/page.tsx`, `components/application/attendance-dashboard.tsx`)

- New route `/app/church-admin/attendance` for service headcount logging.
- Log attendance by service date, type (Sunday morning/evening, Wednesday, special), and headcount.
- 4-week average and trend indicator (up/down) computed client-side.
- Upsert-on-conflict for editing a past record by re-submitting the same date.

#### First-Time Visitor Scaffolding

- **Database**: `first_time_visitors` table with workflow stages (new → day1_sent → day7_sent → call_prompted → converted → inactive).
- **Actions**: `addFirstTimeVisitorAction`, `advanceVisitorWorkflowAction`.

#### Service Attendance Database

- `service_attendance` table with unique constraint on (church_id, service_date, service_type).

### Changed

- **`components/application/portal-workspace.tsx`**: added Small Groups, Events, and Attendance nav items for church-admin role.
- **`components/application/member-bottom-nav.tsx`**: added Groups tab linking to `/app/member/groups`.
- **`docs/product-strategy.md`**: new file — full competitive analysis, pricing strategy, and three-phase build plan.

### Security

- All new tables have RLS enabled with `can_manage_church` / `belongs_to_church` policies consistent with the existing pattern.
- `donation_gl_posts` is append-only in the data layer — no update/delete path exposed.
- Public giving page does not expose any tenant data — only displays configuration from `public_giving_pages` (is_live = true).

## [2.11.1] - 2026-04-17

### Overview

Release 2.11.1 is the first private-repo readiness snapshot for ChurchCore Ops. It keeps the new CCM module intact while hardening the repository for invited evaluation: local credential material is no longer embedded in setup paths, repo metadata is aligned to the current release state, and GitHub-side security workflows are added alongside the existing lint/build checks.

### Fixed

- CCM local-read paths now degrade safely when the local tenant database has not applied the CCM migration yet, instead of crashing the route on `relation "public.ccm_services" does not exist`.
- The local CCM "Open Service" action now returns an explicit setup message telling the operator to rerun `npx supabase db reset && ./supabase/scripts/create-dev-users.sh` when the CCM schema is missing.
- Added a follow-up migration to correct audit trigger functions that still wrote `audit_log.changed_by` after the audit schema standardized on `actor_id`. This unblocks local resets and CCM seed/bootstrap flows.
- Bundled the app fonts locally and switched off `next/font/google` so production builds no longer depend on live Google font downloads.

### Changed

- `supabase/scripts/create-dev-users.sh` now loads local env from `.env.local`, requires `SUPABASE_SERVICE_ROLE_KEY` from env instead of embedding it, generates a local demo password when one is not supplied, and saves the result to the gitignored `.demo-credentials.local`.
- Repo docs no longer publish exact local Supabase auth/storage keys or a fixed demo password. Setup guides now tell contributors how to derive local values from `npx supabase status --output env`.
- Seeded tenant-connection metadata now uses neutral local placeholders instead of committed token-shaped values.
- Added repo scaffolding for private collaboration: `LICENSE`, `SECURITY.md`, `CONTRIBUTING.md`, and GitHub workflows for CodeQL, dependency review, and secret scanning.

## [2.11.0] - 2026-04-17

### Overview

Release 2.11.0 ships the **Children's Church Ministry (CCM) module** — a full operational check-in, safety, and roster system. Benchmarked against Planning Center Check-Ins, KidCheck, Shelby Arena, Ministry Safe, the Church GRACE guidelines, and COPPA, the module addresses all 16 identified gaps in the user's original specification and delivers a production-ready child safety system with PIN/QR pickup verification, custody restriction enforcement, two-adult rule monitoring, emergency evacuation rosters, and insurance-grade incident reporting.

---

### Added — Children's Church Ministry (CCM) Module

#### Database (`supabase/migrations/20260501000000_ccm_module.sql`)

- **`ccm_services`** — service session per event date. Status lifecycle: `open` → `closed` | `emergency`. Grouped check-ins, incidents, and volunteer assignments per service.
- **`ccm_checkin_sessions`** — per-child check-in record. `pin_hash text` stores a bcrypt-12 hash; the plaintext PIN is returned exactly once at creation and never persisted. `qr_token uuid` is service-scoped to prevent replay attacks: a QR code from a prior service will not match the current open service's token.
- **`ccm_authorized_pickups`** — relational authorized guardian table (replaces `authorized_guardians text[]`). Includes relationship type, phone, photo URL, ID-verified flag, and primary-guardian flag.
- **`ccm_custody_restrictions`** — restricted individuals per child. Readable by `can_manage_church()` only — zero member or volunteer read path. Court-order flag, relationship, and encrypted notes.
- **`ccm_volunteer_assignments`** — per-volunteer per-room per-service record powering the two-adult rule engine. Background-check-verified flag and check-in/check-out timestamps.
- **`ccm_incidents`** — insurance-required incident reports. Type (medical, behavioral, security, property, near_miss, other), severity (low/medium/high/critical), guardian-notified flag, and follow-up flag.
- **`ccm_badge_print_jobs`** — print audit log (badge type, printer, printed-by).
- Extends `children_sensitive_data` with `dob`, `photo_url`, `no_photo_flag`, `allergies jsonb` (structured: `[{name, severity}]`), `special_needs_notes`, `custody_notes`.
- `generate_checkin_pin()` Postgres function — 6-character code from an unambiguous charset (no O, 0, I, 1, B, 8, S, 5, Z, 2).
- `audit_ccm_access()` trigger on `ccm_checkin_sessions`, `ccm_authorized_pickups`, `ccm_custody_restrictions`, and `ccm_incidents` — all writes recorded to `audit_log`.

#### Types and Data Layer

- **`lib/ccm-types.ts`** — complete shared type system. `pin_hash` is never present in any TypeScript read type; `CcmCheckinResult` returns the plaintext PIN once for badge printing only.
- **`lib/ccm-data.ts`** — dual-path data fetchers following the `shouldUseLocalTenantFallback()` pattern. `getCcmDashboard` computes `twoAdultRuleMet`, `ratioStatus`, late pickups, and open incidents. `getEmergencyRoster` returns a stripped view (name, room, allergy only — no private medical notes) for emergency use.
- **`app/app/ccm-actions.ts`** — server actions with bcrypt PIN hashing (bcryptjs, cost 12). `checkinChildAction` generates and hashes the PIN atomically. `checkoutChildAction` verifies via `bcrypt.compare` or QR token match. All actions protected by `requireCcmSession()` (church-admin role required).

#### Routes (`app/app/church-admin/children/`)

17 new server-component pages: dashboard, checkin kiosk, checkout kiosk, child directory, child profile, new child registration, services list, new service, service detail, roster, emergency roster, incidents list, new incident, volunteers, rooms, settings, and root redirect.

#### UI Components (`components/application/`)

- **`ccm-nav.ts`** — `ccmNavItems(activePath)` sidebar helper with 10 items.
- **`ccm-dashboard.tsx`** — live service dashboard. Ratio exceeded / two-adult rule violation alert banners. Summary strip (checked-in / checked-out / late pickups / open incidents). `CcmRoomCard` SimpleGrid.
- **`ccm-room-card.tsx`** — per-room card with ratio Progress bar, two-adult rule `ShieldAlert`, volunteer chips with background-check expiry coloring.
- **`ccm-checkin-kiosk.tsx`** — drop-off kiosk. Check-in form → `checkinChildAction` → `CcmBadgePreview` on success.
- **`ccm-checkout-kiosk.tsx`** — pick-up station. Two-step: child search (filtered cards with allergy/no-photo badges) → PIN/QR verification. Calls `checkoutChildAction` with `bcrypt.compare` server-side.
- **`ccm-badge-preview.tsx`** — client-side badge renderer. `AllergyBar` in red for anaphylactic/moderate allergies. `NO PHOTOS` red banner when `no_photo_flag` is set. PIN in 28pt monospace for easy reading. Guardian claim check with matching PIN. `window.print()` trigger.
- **`ccm-child-profile.tsx`** — child directory list + profile editor. `CcmChildProfileView` renders custody restriction red Alert at the highest visual position. Structured `AllergyEditor`. Authorized pickups table with inline add form. Background check status.
- **`ccm-roster.tsx`** — full service roster (`CcmRosterView`) and emergency roster (`CcmEmergencyRoster`) grouped by room, stripped of PII, print-optimized.
- **`ccm-incident-form.tsx`** — incident list (`CcmIncidentList`) and filing form (`CcmIncidentForm`). High/critical severity fires a staff-action prompt. Guardian notified and follow-up checkboxes.
- **`ccm-volunteer-panel.tsx`** — volunteer assignments per service. Background check verification badges. Expiring-soon warnings. Assign form (role + BG check flag).
- **`ccm-service-manager.tsx`** — service list, open-service form, service detail with close-service action, room manager, and module settings (ratio thresholds, late-pickup timeout, two-adult enforcement, COPPA data retention notice).

#### Navigation Integration

- `components/application/portal-workspace.tsx` — added "Children's Ministry" nav item (ShieldCheck icon) after Finance for church-admin role.
- `components/application/ministry-track-children.tsx` — added "Open Full CCM Module" button linking to `/app/church-admin/children`.

#### Seed Data

- `supabase/seed.sql` — CCM demo service (open), three check-in sessions (Emma Thompson, Noah Martinez, Sophie Johnson), authorized pickups, two volunteer assignments (lead teacher + assistant), and a low-severity demo incident.

#### Security Architecture

- **PIN hashing**: bcrypt cost 12. Plaintext PIN returned once at creation and immediately discarded. `pin_hash` is never exposed in TypeScript read types.
- **QR replay prevention**: `qr_token` is UUID-per-session. QR encodes `{serviceId}:{sessionId}:{qrToken}`; a token from a prior service fails because the `service_id` won't match the current open service.
- **Custody restrictions**: `can_manage_church()` read-only — no volunteer or member path. Rendered as a full-width red Alert at the top of the checkout UI before the release button is reachable.
- **Two-adult rule**: `confirmedVolunteers.filter(v => v.checkedInAt).length >= 2`. Dashboard shows red `ShieldAlert` badge and top-level alert when unmet.
- **Audit trail**: all CCM PII table writes logged to `audit_log` via triggers.
- **Data retention**: COPPA — check-in records 7-year liability retention, child PII annual review, custody restrictions retained indefinitely until manually removed by church admin.

---

## [2.10.0] - 2026-04-17

### Overview

Release 2.10.0 is the largest single feature release in the project's history. It ships two major system expansions simultaneously: the **Financial Management module** — a full double-entry accounting system built for 501(c)(3) church operations — and the **Advanced Ministry Forge** — an expanded set of ten specialized track panels that move the platform from administrative tracking into active Kingdom Stewardship. Together these additions bring ChurchCore Ops to full coverage of the five most critical operational domains any church leadership team manages: people, ministry programs, finances, reporting, and communications.

---

### Added — Financial Management Module

The finance module lives under `/app/church-admin/finance` and is restricted to the `church-admin` role. It provides a complete internal bookkeeping system independent of the existing Stripe donations flow, allowing churches to manage their full general ledger, track against budgets, and satisfy 501(c)(3) annual reporting requirements.

#### Database

- **`supabase/migrations/20260417000000_financial_management.sql`** — introduces six new tables, all church-scoped with RLS enforced via `can_manage_church()`:
  - `finance_accounts` — hierarchical chart of accounts with `parent_id` self-reference for multi-level account trees (e.g. `5000 Expenses → 5100 Salaries → 5110 Pastoral Salaries`). Account type is constrained to `asset`, `liability`, `equity`, `income`, or `expense`.
  - `finance_journals` — journal batch records with status lifecycle: `draft` → `posted` → `voided`. Each journal has a `journal_type` (general, accounts_payable, bank, payroll, adjustment) and tracks who posted and voided it with timestamps.
  - `finance_journal_lines` — individual debit and credit lines linked to a journal and account. `amount_cents integer` — no floating point, consistent with the `donations` table. App layer validates that `sum(debits) = sum(credits)` before persisting.
  - `finance_budgets` — a named budget version per fiscal year per church, with `is_active` flag and fiscal year range.
  - `finance_budget_lines` — per-account budgeted amount within a budget, with `amount_cents`.
  - `finance_imports` — import job log recording filename, detected format, row counts, status (`pending`, `processing`, `completed`, `failed`), and error details for audit and retry.
  - Audit triggers on `finance_journals` and `finance_accounts` write to `audit_log`.

#### Data & Actions Layer

- **`lib/finance-types.ts`** — comprehensive shared TypeScript types for the entire finance domain:
  - Enums: `AccountType`, `JournalStatus`, `JournalType`, `ImportFormat`, `ImportStatus`, `JournalLineSide`
  - Entity types: `FinanceAccount`, `FinanceJournal`, `FinanceJournalLine`, `FinanceBudget`, `FinanceBudgetLine`, `FinanceImport`
  - Report aggregates: `FinanceDashboardData`, `IncomeStatementData`, `BalanceSheetData`, `BudgetVarianceRow`
  - Import wizard types: `ImportColumnMapping`, `ImportPreviewRow`

- **`lib/finance-data.ts`** — server-only data fetchers following the dual-path pattern (Supabase REST client vs. direct `queryTenantLocalDb` Postgres pool), selected by `shouldUseLocalTenantFallback()`:
  - `getFinanceAccounts` — fetches the full chart of accounts for a church, optionally filtered by active status
  - `getFinanceJournals` — journal list with status filtering and pagination-ready structure
  - `getFinanceJournalWithLines` — full journal detail including all debit/credit lines with account codes and names
  - `getFinanceBudgets` — budget list for a church with active flag
  - `getBudgetVariance` — per-account actual vs. budgeted totals joined across `finance_journal_lines` and `finance_budget_lines` for the selected budget period
  - `getFinanceImports` — import history list ordered by creation date
  - `getFinanceDashboardData` — aggregated dashboard metrics: total income, total expenses, net position, and budget utilization percentage
  - `getIncomeStatement` — income and expense accounts with period totals, sorted by account code
  - `getBalanceSheet` — asset, liability, and equity accounts with running balances
  - `getFinanceBudgetLines` — per-account budget line amounts for a specific budget version

- **`app/app/finance-actions.ts`** — server actions with role-guarded access (church-admin only):
  - `createAccountAction` / `updateAccountAction` — create and update chart of accounts entries with parent hierarchy support
  - `createJournalAction` — validates debit/credit balance (`sum(debits) === sum(credits)`) before inserting; rejects unbalanced entries with a descriptive error
  - `postJournalAction` — transitions a draft journal to `posted` status with `posted_at` and `posted_by` recorded
  - `voidJournalAction` — voids a posted journal with `voided_at`, `voided_by`, and a required reason
  - `deleteJournalDraftAction` — hard-deletes a draft journal and its lines (posted and voided journals cannot be deleted)
  - `createBudgetAction` / `upsertBudgetLinesAction` — create budget versions and upsert per-account line amounts
  - `importFinanceRowsAction` — creates an import job record and a corresponding draft journal entry, inserts debit/credit lines for each imported row using the user-selected default debit and credit accounts

#### Routes

Eleven new routes under `app/app/church-admin/finance/`, all protected with `requireChurchSession` and `church-admin` role guard:

| Route | Purpose |
|---|---|
| `finance/` | Redirect to `finance/dashboard` |
| `finance/dashboard` | Summary cards, budget health ring, income/expense breakdowns, recent journal list |
| `finance/accounts` | Chart of accounts grouped by type; add account modal |
| `finance/accounts/[id]` | Account detail: ledger view of all journal lines for the account |
| `finance/journals` | Journal list with status badges and type indicators |
| `finance/journals/new` | New journal entry form with live debit/credit balance checker |
| `finance/journals/[id]` | Journal detail; edit draft lines; post or void; read-only for posted/voided |
| `finance/budgets` | Budget list by fiscal year |
| `finance/budgets/[id]` | Budget detail: per-account budgeted vs. actual vs. variance table |
| `finance/import` | Multi-step import wizard |
| `finance/reports` | Tabbed financial reports: Income Statement, Balance Sheet, Budget Variance |

#### UI Components

- **`finance-dashboard.tsx`** — dashboard with `SimpleGrid` summary cards (total income, expenses, net position, budget utilization `RingProgress`), income-by-account and expense-by-account breakdown tables, and a recent journals table with direct links to detail pages.
- **`finance-accounts-workspace.tsx`** — hierarchical chart of accounts grouped by account type (`asset`, `liability`, `equity`, `income`, `expense`). Includes an add-account modal with type selector, optional parent account picker, account code, name, and description fields.
- **`finance-journal-workspace.tsx`** — journal list with `Badge` status indicators (draft/posted/voided) and journal type badges. Clicking any row navigates to the detail page.
- **`finance-journal-editor.tsx`** — full journal editor with an editable debit/credit line table, running balance display (green when balanced, red when not), and action buttons for posting, voiding, and deleting. Read-only mode is enforced for posted/voided journals.
- **`finance-budget-workspace.tsx`** — budget list view switching to a line-by-line detail view showing account code, account name, budgeted amount, actual year-to-date, variance (absolute and percentage), and a heat-map color indicator per line.
- **`finance-import-wizard.tsx`** — four-step `Stepper` wizard: (1) file upload with auto-format detection; (2) column mapping for CSV/Excel files (skipped for auto-parsed IIF/OFX); (3) 20-row preview table with per-row error badges; (4) completion screen with link to review the created draft journal entry.
- **`finance-reports-workspace.tsx`** — tabbed reports surface with Income Statement (income accounts, expense accounts, net income), Balance Sheet (assets, liabilities, equity), and Budget Variance (per-account budgeted/actual/difference). Built with Mantine `Tabs`, `Table`, and `Badge`.
- **`finance-nav.ts`** — shared `financeNavItems(activePath: string)` helper used by all finance route pages to construct the consistent sidebar navigation array.

#### Import Engine

- **`lib/finance-import.ts`** — client-safe import parsers, no DB access:
  - `parseDollarsToCents(value)` — strips `$`, `,`, whitespace; converts to integer cents; handles negative amounts
  - `normalizeDate(value)` — normalizes ISO, `MM/DD/YYYY`, `MM-DD-YYYY`, and `YYYYMMDD` (OFX compact) formats to `YYYY-MM-DD`
  - `parseCsv(raw)` — async; uses `papaparse` with `trimHeaders: true` and `skipEmptyLines: true`; falls back to a minimal built-in parser if `papaparse` is unavailable in the current environment
  - `parseXlsx(buffer, sheetIndex?)` — async; uses the `xlsx` library; reads the first sheet as header-keyed rows; `cellDates: true` for proper date handling
  - `parseCsvBuiltin(raw)` — synchronous fallback CSV parser with quoted-field support
  - `csvRowsToPreview(rows, mapping)` — converts header-keyed rows + column mapping to `ImportPreviewRow[]`, flagging invalid dates and zero amounts as errors
  - `parseIif(raw)` — QuickBooks IIF tab-delimited parser; handles `!TRNS`, `TRNS`, `!SPL`/`!SPLT`, `SPL`/`SPLT`, and `ENDTRNS` markers; captures account name, split account, memo, amount, and doc number
  - `iifToPreview(transactions)` — maps IIF transaction objects to `ImportPreviewRow[]`, using amount sign to assign debit/credit account codes
  - `parseOfx(raw)` — OFX/QFX SGML parser using regex extraction on `<STMTTRN>` blocks; extracts `DTPOSTED`, `NAME`/`PAYEE`, `TRNAMT`, `FITID`, `MEMO`, `TRNTYPE`
  - `ofxToPreview(transactions)` — maps OFX transactions to `ImportPreviewRow[]`, using `TRNTYPE` and amount sign to assign debit/credit side; uses `"BANK"` as a placeholder account code for the bank-clearing side
  - `parsePlainText(raw)` — auto-detects tab-delimited or pipe-delimited plain text, falls back to CSV
  - `detectFormat(filename, rawText?)` — prioritizes filename extension; sniffs content for `<OFX>`, `<STMTTRN>`, `!TRNS`, `ENDTRNS` markers when extension is ambiguous

#### Dependencies Added

- `xlsx` — Apache-licensed Excel read/write library for `.xlsx` and `.xls` parsing
- `papaparse` + `@types/papaparse` — robust, well-supported CSV parsing with quoted-field handling and configurable options

#### Architecture Decision Record

- **`docs/adr/0003-financial-management-module.md`** — documents the decision to build full fund-based double-entry accounting rather than a simple expense tracker, the decision to add `xlsx` and `papaparse` as dependencies, and the decision to keep monetary values as integer cents throughout.

---

### Added — Advanced Ministry Forge (10 Specialized Track Panels)

The existing Ministry Forge had dedicated management panels for worship, men's, women's, marriage, and missions ministries. This release adds five more, expanding full panel coverage to all ten ministry track kinds supported by the data model.

#### Database

- **`supabase/migrations/20260430000000_advanced_ministry_forge.sql`** — introduces the following schema additions:

**Profile extensions:**
- `profiles.member_number` (`text`, unique per church) — non-sequential human-readable identifier, nullable for backward compatibility
- `profiles.safety_clearance_date` (`date`) — background check clearance date, used by the Children's Safety Index
- `profiles.specialized_tags` (`text[]`) — hobby, career, or interest tags used for life-stage matching and career-kingdom mentorship

**Ministry type expansion:**
- `ministries.ministry_type` constraint updated to include `young_adult` and `education`
- `ministry_tracks.track_kind` constraint updated to be consistent with all ten track kinds

**Children's Ministry:**
- `children_rooms` — classroom definitions with `name`, `age_min`, `age_max`, `capacity`, and `target_ratio` (children per leader). Per-ministry, church-scoped. RLS: `belongs_to_church` for read, `can_manage_church` for write.
- `children_checkins` — per-service check-in/out log: `child_name`, `guardian_name`, `checked_in_at`, `checked_out_at`, `leader_count`, `service_date`. RLS: manager-only (no member read).
- `children_sensitive_data` — one row per child per church for pickup codes, authorized guardian names, medical alerts, and emergency contact. **RLS: `can_manage_church` only — intentionally excludes member read.** Full audit trigger writes every access to `audit_log`. Note in migration: fields should be encrypted via Supabase Vault (`pgsodium`) before production deployment.

**Youth Ministry:**
- `youth_milestones` — milestone catalog per ministry: name, description, order, and `is_required` flag. Examples: Baptism, First Serve, Faith Foundations Class, Student Leader Role.
- `youth_graduation_tracking` — per-student, per-milestone completion record with `completed_at` date and expected `graduation_year`. Unique on `(church_id, profile_id, milestone_id)`. RLS: `belongs_to_church` for read.

**Young Adults Ministry:**
- `young_adult_career_mentorships` — career-kingdom mentor/mentee pairs with `industry` and `focus_area` fields. Status: `active`, `completed`, `paused`, `seeking`. RLS: participants see their own pairs; managers see all.

**Education / Discipleship:**
- `education_courses` — course catalog with `title`, `curriculum_area` (constrained to `theology`, `bible_survey`, `spiritual_disciplines`, `church_history`, `apologetics`, `leadership`, `marriage_family`, `missions`, `finance`, `other`), `duration_weeks`, `is_active`, and `course_order`.
- `education_enrollments` — per-member course enrollment with `enrolled_at`, `completed_at`, and `certificate_issued`. Unique on `(church_id, course_id, profile_id)`. RLS: members can see their own; managers see all.

**Outreach Ministry:**
- `outreach_events` — community partnership events with date, location, `zone_name`, GPS coordinates (`latitude`, `longitude`), `volunteer_count`, `people_served`, and status.
- `outreach_zones` — neighborhood/zone summary table for heatmap display: `zone_name`, running totals for events/volunteers/served, `last_event_date`, and `coverage_level` (`low`, `medium`, `high`). Unique on `(church_id, zone_name)`.

**Marriage Ministry:**
- `marriage_pulse_entries` — completely anonymous weekly sentiment entries: `survey_week` (ISO week start Monday), `theme` (communication, parenting, finance, intimacy, conflict, purpose, spiritual_growth, other), `sentiment` (1–5). **No `profile_id` column — anonymity is enforced at the schema level.** Members can insert; only managers can read aggregates.

**Stewardship views:**
- `discipleship_velocity` — PostgreSQL view computing per-church: `leader_count`, `avg_days_to_leader`, `min_days`, `max_days`. Calculated from the gap between `profiles.created_at` and the `ministry_tracks.created_at` of their first leader-role track entry.
- `burnout_category_counts` — view flagging members active in more than 3 distinct `track_kind` categories. Columns: `church_id`, `profile_id`, `full_name`, `distinct_track_count`, `active_tracks[]`. Used by the Burnout Guardian.

#### Type System

- **`lib/ministry-forge-types.ts`** extended with:
  - `MinistryType` union expanded to include `"young_adult"` and `"education"`
  - `TRACK_PANEL_TYPES` set expanded from 5 to 10: adds `children`, `youth`, `young_adult`, `education`, `outreach`
  - **Children's types:** `ChildrenRoom`, `ChildrenCheckin`, `ChildrenRoomSafety` (with `ratioStatus: "safe" | "warning" | "alert"`), `ChildrenTrackData`
  - **Youth types:** `YouthMilestone`, `YouthStudent` (with `readinessPercent` 0–100 and `alertLevel: "on_track" | "at_risk" | "critical"`), `YouthTrackData`
  - **Young Adults types:** `CareerMentorship`, `YoungAdultTrackData` (includes `seekingMentors` list)
  - **Education types:** `EducationCourse` (with `enrolledCount` and `completedCount`), `MemberDoctrinalProgress` (with `completedAreas[]` and `coveragePercent`), `EducationTrackData`
  - **Outreach types:** `OutreachEvent`, `OutreachZone` (with `coverageLevel`), `OutreachTrackData` (includes `totalVolunteerHours` and `totalPeopleServed` aggregates)
  - **Stewardship types:** `DiscipleshipVelocity`, `BurnoutCandidate`, `MarriagePulseEntry`

#### Data Layer

Five new exported functions added to **`lib/ministry-forge-data.ts`**, each following the existing dual-path pattern:

- **`getChildrenTrackData(session, ministryId)`** — fetches rooms, recent check-ins (50 records), and background check status for ministry leaders. Builds a `safetySnapshot[]` on the fly by comparing today's active check-ins per room against the room's `target_ratio`. `ratioStatus` is `"alert"` when `actualRatio > targetRatio`, `"warning"` when within 10% of the limit. Background check array includes leaders with no clearance date or clearance expiring within 30 days.
- **`getYouthTrackData(session, ministryId)`** — fetches milestones and per-student tracking records. Computes `readinessPercent` as the fraction of required milestones completed. Sets `alertLevel` to `"critical"` when readiness < 50% and graduation ≤ 1 year away, `"at_risk"` when readiness < 75% and graduation ≤ 2 years away.
- **`getYoungAdultTrackData(session, ministryId)`** — fetches career mentorship pairs with mentor/mentee names. Derives `seekingMentors` list from pairs with `status = "seeking"`.
- **`getEducationTrackData(session, ministryId)`** — fetches course catalog (with enrollment/completion counts aggregated in SQL for the local path), then builds per-member `MemberDoctrinalProgress` by walking enrollments. `coveragePercent` is the fraction of distinct `curriculum_area` values the member has completed at least one course in.
- **`getOutreachTrackData(session, ministryId)`** — fetches events (50 records, most recent first) and zones (sorted by `total_served` descending). Computes `totalVolunteerHours` as an estimate (3 hours × volunteer count per event) and `totalPeopleServed` as the sum of all `people_served` values.
- **`getDiscipleshipVelocity(session)`** — reads from the `discipleship_velocity` view for the current church.
- **`getBurnoutCandidates(session)`** — reads from the `burnout_category_counts` view, filtered to `distinct_track_count > 3`.

#### UI Components

Five new track panel components, each following the established design language (Mantine UI, Lucide icons, `AI_ASSISTIVE_DISCLAIMER` footer):

- **`ministry-track-children.tsx` — Safety-First Dashboard**
  - Top-level red alert banner fires when any classroom exceeds its target ratio; orange warning banner fires when within 10% of the limit.
  - Safety Index grid: one `Paper` card per room showing current child count, leader count, actual ratio, target ratio, a `Progress` bar (color-coded by status), and a `RatioStatusBadge`.
  - Background Check Status table: leaders with no clearance record shown in red; leaders expiring within 30 days shown in orange.
  - Recent Check-ins table: last 15 records with check-out status badge.

- **`ministry-track-youth.tsx` — Graduation Readiness Tracker**
  - Summary strip: total students, required milestone count, at-risk count (orange), critical count (red).
  - Graduation Readiness Table sorted by alert level (critical first): student name, graduation year, `Progress` bar with percentage, completed/required count, and an `AlertBadge`.
  - Milestone Catalog table: ordered list of all milestones with required/optional badge.

- **`ministry-track-young-adult.tsx` — Career–Kingdom Mentorship Map**
  - Summary stats: active pairs, completed pairs, seeking count, industries covered.
  - Career–Kingdom Mentorship Pairs table: mentor, mentee, industry, focus area, status badge.
  - Seeking a Mentor table: young adults waiting for a match with their industry interest.

- **`ministry-track-education.tsx` — Doctrinal Blueprint**
  - Summary stats: active courses, curriculum areas, total enrollments, total completions.
  - Course Catalog table: title, curriculum area badge (color-coded by area), duration in weeks, enrollment and completion counts.
  - Doctrinal Blueprint table: per-member `Progress` bar for theological coverage percentage; completed area badges; courses completed count.

- **`ministry-track-outreach.tsx` — Neighborhood Density**
  - Summary stats: events completed, upcoming events, estimated volunteer hours, people served.
  - Neighborhood Density zone table: zone name, event count, volunteer count, people served, last event date, coverage level badge (red/yellow/green).
  - Low-coverage zone callout text listing zone names needing attention.
  - Event Log table: last 15 events with date, zone, volunteer count, served count, and status badge.

#### Dashboard Integration

- **`ministry-forge-dashboard.tsx`** updated:
  - `TRACK_TAB_META` expanded with entries for `children`, `youth`, `young_adult`, `education`, `outreach` — each with label and Lucide icon (`ShieldCheck`, `GraduationCap`, `Briefcase`, `BookOpen`, `Globe`).
  - `MINISTRY_TYPE_OPTIONS` expanded to include `young_adult`, `men`, `women`, `marriage`, and `education` (previously missing from the settings selector).
  - Component props extended with `childrenData?`, `youthData?`, `youngAdultData?`, `educationData?`, `outreachData?`.
  - Track panel render block updated to render the appropriate panel component for each of the five new types.
  - `Briefcase` and `GraduationCap` added to Lucide imports.

- **`app/app/church-admin/ministry/[id]/page.tsx`** updated:
  - Imports all five new data fetchers.
  - Parallel `Promise.all` block expanded from 5 to 10 conditional fetches — each fetcher is called only when `ministryType` matches, so unrelated ministries pay zero overhead.
  - All five new data props passed through to `MinistryForgeDashboard`.

- **`ministry-forge-list.tsx`** updated:
  - `TYPE_META` record (typed as `Record<MinistryType, …>`) extended with `young_adult` and `education` entries to satisfy the exhaustive type constraint.
  - `GraduationCap` and `Briefcase` added to Lucide imports.

#### Seed Data

`supabase/seed.sql` extended with demo data for all five new track types:

- **Children's:** 5 rooms (Nursery 0–2, Toddler 3–4, Pre-K/Kinder, Elementary 7–10, Pre-Teen 11–12) with capacity and target ratios; 3 sample check-ins for today's service.
- **Youth:** 4 milestones (Baptism ✓ required, First Serve ✓ required, Faith Foundations ✓ required, Student Leader optional); 2 completion records for David Chen with graduation year 2027.
- **Young Adults:** 4 career mentorships across Finance, Technology, Education, and Healthcare industries, including one `seeking` entry.
- **Education:** 7 courses across 6 curriculum areas (theology, bible_survey, spiritual_disciplines, church_history, apologetics, finance); 6 enrollment records for Sarah, Robert, and Marcus with mix of completed and in-progress.
- **Outreach:** 5 zones (Riverside District, Downtown Core, East Side Families, Northgate Schools, South Harbor Seniors) with coverage levels; 5 events including 4 completed and 1 planned.
- **Marriage:** 8 anonymous pulse entries across 4 weeks covering themes: communication, parenting, finance, spiritual_growth, conflict, intimacy.

---

### Added — Ministry List Type Coverage

- `ministry-forge-list.tsx` `TYPE_META` record now covers all 13 `MinistryType` values, resolving a TypeScript strict-mode error that would have caused build failures as the type union grew.

---

### Fixed

- Fixed `NEXT_REDIRECT` error being swallowed as a toast in `tenant-view-controls.tsx`. Next.js `redirect()` throws a special error with a `digest` starting with `"NEXT_REDIRECT"`. Both `handleLaunch` and `handleReturn` now re-throw this error so Next.js can complete navigation rather than displaying a spurious "Cannot launch tenant view" notification.
- Fixed `shouldUseLocalTenantFallback()` called with an argument in all five new data fetchers. The function signature takes zero arguments; the session argument was removed from all call sites.
- Fixed `profiles.first_name` / `profiles.last_name` references in new data fetchers. The `profiles` table uses a single `full_name` column. All new SQL queries and Supabase `.select()` calls updated accordingly.
- Fixed `education_enrollments` seed inserts incorrectly including a `ministry_id` column that does not exist on that table. Column removed from all enrollment insert statements.
- Fixed `discipleship_velocity` view referencing `p.first_visit_at` which does not exist on `profiles`. Updated to use `p.created_at`.
- Fixed `burnout_category_counts` view referencing `p.first_name || ' ' || p.last_name` — updated to `p.full_name`.

---

### Security & Ethical Guardrails

- **Children's PII:** `children_sensitive_data` (pickup codes, medical alerts, authorized guardians) is in an isolated table with `can_manage_church` RLS — no member-role read access under any circumstance. A trigger audits every write to `audit_log`. Migration comment specifies that `pickup_code` and `medical_alerts` columns should be encrypted via Supabase Vault (`pgsodium.create_key + vault.create_secret`) before any production deployment.
- **Marriage confidentiality:** `marriage_pulse_entries` has no `profile_id` column. Anonymity is a schema constraint, not just a policy. Members can submit; only managers can read aggregate results.
- **Pastoral separation:** Marriage and pastoral care data remain in isolated tables (established in prior releases) with `can_manage_church` / `pastor_elder`-scoped RLS. This release adds no relaxation of those boundaries.
- **AI disclaimer:** Every new track panel component renders `AI_ASSISTIVE_DISCLAIMER` ("This is an assistive tool only and does not replace prayer, Scripture, or human discernment.") in its footer, consistent with the project-wide canonical disclaimer in `ministry-forge-types.ts`.

---

### Changed

- `lib/ministry-forge-types.ts`: `MinistryType` union and `TRACK_PANEL_TYPES` set are now the single source of truth for which ministry kinds exist and which have dedicated panels. Any addition here automatically propagates to type checks across the data layer, dashboard, and list components.
- `supabase/seed.sql` notice message updated from "6 ministries, 8 profiles, track data for all 5 panel types" to "10 ministries, 8 profiles, track data for all 10 panel types".
- `DEVELOPMENT_PLAN.md` updated to reflect Financial Management and Advanced Ministry Forge as shipped features in Sprint 4.

---

## [2.9.0] - 2026-04-16

### Added

- Added Financial Management module — a full double-entry accounting system for churches with chart of accounts, journal entries, budgets, and financial reporting.
- Added `supabase/migrations/20260417000000_financial_management.sql` — six new tables: `finance_accounts` (hierarchical chart of accounts), `finance_journals` (journal batches), `finance_journal_lines` (debit/credit lines), `finance_budgets`, `finance_budget_lines`, and `finance_imports`. All tables have RLS enforced via `can_manage_church()` (church-admin only). Audit triggers on journals and accounts.
- Added `lib/finance-types.ts` — shared TypeScript types for all finance entities (FinanceAccount, FinanceJournal, FinanceBudget, etc.).
- Added `lib/finance-data.ts` — server-only data fetchers for dashboard, accounts, journals, budgets, budget variance, income statement, and balance sheet. Follows dual-path pattern (Supabase client + local `queryTenantLocalDb`).
- Added `lib/finance-import.ts` — import parsers for CSV (via papaparse), Excel .xlsx (via xlsx library), QuickBooks IIF, OFX/QFX bank feeds, and plain text. Auto-detects format from filename/content.
- Added `app/app/finance-actions.ts` — server actions: `createAccountAction`, `updateAccountAction`, `createJournalAction`, `postJournalAction`, `voidJournalAction`, `deleteJournalDraftAction`, `createBudgetAction`, `upsertBudgetLinesAction`, `importFinanceRowsAction`.
- Added route tree at `app/app/church-admin/finance/` — dashboard, accounts, accounts/[id], journals, journals/new, journals/[id], budgets, budgets/[id], import, and reports pages.
- Added 7 UI components: `finance-dashboard.tsx`, `finance-accounts-workspace.tsx`, `finance-journal-workspace.tsx`, `finance-journal-editor.tsx`, `finance-budget-workspace.tsx`, `finance-import-wizard.tsx`, `finance-reports-workspace.tsx`.
- Added `components/application/finance-nav.ts` — shared sidebar nav items for the finance module.
- Added `docs/adr/0003-financial-management-module.md` — ADR documenting the decision to implement full double-entry accounting, and the addition of `xlsx` and `papaparse` dependencies.
- Added `xlsx` and `papaparse` (+ `@types/papaparse`) npm dependencies for Excel and CSV import parsing.
- Added Finance nav item to `portal-workspace.tsx` for the church-admin role (Landmark icon, routes to `/app/church-admin/finance`).

### Access

Finance module is restricted to `church-admin` role only. All route pages include a role guard that redirects non-admin users.

## [2.8.0] - 2026-04-15

### Added

- Added local Supabase development setup with full schema and seed data. Running `npx supabase db reset && ./supabase/scripts/create-dev-users.sh` applies all migrations and seeds Grace Harbor Church with 8 profiles, 6 ministries (worship, men's, women's, marriage, missions, outreach), health history, kingdom impacts, and complete track-panel data for all five specialized ministry types.
- Added `supabase/scripts/create-dev-users.sh` — a one-shot script that creates `sarah@churchcoreops.app` (church-admin + platform-admin) and `david@graceharbor.church` (member) via the Supabase Admin API and re-runs the seed. Required after every `db reset` because Supabase resets `auth.users` on each reset.
- Added `docs/setup/local-supabase.md` — comprehensive local Supabase setup guide covering prerequisites, first-time setup, `.env.local` configuration, seeded demo accounts and data, day-to-day commands, auth flow notes, key env variable reference, schema bug fixes applied, and troubleshooting.
- Added Ministry Forge Phase 4 track panels (worship, men's, women's, marriage, missions) — five new dedicated management tabs that appear conditionally when a ministry's `ministry_type` matches a panel type. Each panel surfaces type-specific data: song library and rehearsal schedule (worship), mentorship pairs and discipleship groups (men's), life-stage circles and support pairings (women's), mentor couples and enrichment cohorts with confidentiality guardrails (marriage), and mission partners plus trip roster with impact metrics (missions).
- Added `supabase/migrations/20260421000000_ministry_tracks_phase4.sql` — new tables for `worship_songs`, `worship_rehearsals`, `mentorship_pairs`, `discipleship_groups`, `life_stage_circles`, `support_pairings`, `mentor_couples`, `marriage_cohorts`, `mission_partners`, and `mission_trips`, all with RLS. Marriage tables are manager-only. Mentorship pairs carry an audit trigger.
- Added `components/application/ministry-track-worship.tsx`, `ministry-track-mens.tsx`, `ministry-track-womens.tsx`, `ministry-track-marriage.tsx`, `ministry-track-missions.tsx` — the five track panel UI components with preview-safe stub data rendering.
- Added Ministry Forge index page at `/app/church-admin/ministry` — a grid of all church ministries with health-band indicators, type badges, member counts, track-panel callouts, and a summary strip. Clicking any card navigates to that ministry's detail dashboard.
- Added `components/application/ministry-forge-list.tsx` — the Ministry Forge index UI component.

### Changed

- Changed Ministry Forge nav links from the broken `/app/church-admin/ministry/overview` to the new index route `/app/church-admin/ministry` in both `church-admin-people-workspace.tsx` and `portal-workspace.tsx`.
- Changed `supabase/seed.sql` from a minimal 2-ministry skeleton to a full demo dataset covering all five track panel types with realistic seeded content (songs, rehearsals, mentorship pairs, discipleship groups, life-stage circles, support pairings, mentor couples, cohorts, mission partners, and trips).
- Changed `buildPreviewMinistryList()` and `buildPreviewMinistryDetail()` in `lib/ministry-forge-data.ts` to return six demo ministries (one per track type plus outreach) with realistic vision statements, health scores, health history, and impact log entries. Preview mode now shows fully populated ministry cards and all five track panel tabs without a backend connection.
- Changed `.env.local` to include all four required local Supabase variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (JWT eyJ… format), `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_DB_URL`.

### Fixed

- Fixed 404 at `/app/church-admin/ministry` — created `app/app/church-admin/ministry/page.tsx` as the Ministry Forge index. Previously only the `[id]` detail route existed, so the nav link always 404'd.
- Fixed `platform_admins.user_id` FK — migration `20260422` changes the foreign key from `profiles(id)` to `auth.users(id)`. The `is_platform_admin()` RLS function compares against `auth.uid()` (an auth user UUID), so the original FK was incorrect and caused seed failures.
- Fixed `church_memberships.user_id` FK — migration `20260423` applies the same correction. The auth layer queries `church_memberships.user_id = auth.uid()` which is an auth user UUID, not a profile UUID.
- Fixed `audit_mentorship_pairs()` trigger — migration `20260424` corrects a column name typo: the trigger referenced `changed_by` but the `audit_log` table uses `actor_id`.

### Release Notes

Release 2.8.0 transitions ChurchCore Ops from preview-only mode to a fully operational local development environment backed by a real Supabase instance.

**What changed in the data layer:** The local Supabase stack is now correctly wired end-to-end. Three schema-level bugs — all introduced by inconsistencies between the RLS layer (which uses `auth.uid()`) and table FK definitions (which pointed at `profiles.id`) — are fixed in three targeted migrations. A fourth migration corrects a column name typo in the mentorship audit trigger. The seed file is now a proper demo dataset rather than a skeleton.

**What changed in the UI:** The Ministry Forge directory page (previously 404) now exists as a proper index at `/app/church-admin/ministry`, showing all ministries in a card grid with health-band color coding, type badges, track-panel indicators, and a summary strip. From there, clicking any card navigates to the full ministry detail dashboard. The five track panel tabs (worship, men's, women's, marriage, missions) show real seeded content when running locally with Supabase, or realistic in-memory stub data in preview mode.

**Env setup:** `.env.local` now documents all four required variables. The publishable key must be the JWT `eyJ…` format from `npx supabase status --output env` — not the `sb_publishable_*` format shown in the default status output, which is incompatible with `@supabase/ssr`.

**Developer workflow:** `npx supabase db reset && ./supabase/scripts/create-dev-users.sh` is the single command that gets a clean local environment with all demo data. Full documentation is in `docs/setup/local-supabase.md`.

## [2.7.0] - 2026-04-15

### Added

- Added the first reporting-suite foundation under `/app/reports`, `/app/reports/members`, `/app/reports/events`, and `/app/reports/giving`, with a shared reporting shell, range switching, graphical dashboards, and preview-safe fallback behavior for pastor and church-admin roles.
- Added `lib/reports-data.ts` to compute member, event, and giving report datasets across preview, local direct-DB fallback, and live tenant Supabase paths.
- Added navigation entry points into the reporting suite from existing pastor and church-admin management surfaces.
- Added `docs/plans/reporting-implementation.md`, a detailed implementation plan for ChurchCore Ops's future reporting suite across members, events, giving, ministries, communications, outreach, and executive stewardship dashboards.

### Changed

- Updated `DEVELOPMENT_PLAN.md` to version `1.8`, explicitly positioning graphical multi-surface reporting as a core ChurchCore Ops feature area.
- Updated `README.md` to release `2.7.0` and documented the new reporting suite routes, release highlights, and repo-level reporting plan reference.

### Fixed

- Fixed tenant giving loaders so `/app/giving` and `/app/member/giving` return safe empty-state data when tenant Supabase environment variables are not configured, instead of throwing during server render in preview or reduced-backend mode.
- Fixed the communications hub loader so `/app/communications` also returns safe empty-state data when tenant Supabase environment variables are missing, matching the rest of the preview-mode tenant surfaces.

### Release Notes

This release establishes ChurchCore Ops's first real reporting surface rather than treating reporting as a future-only concept.

Before `2.7.0`, the product had point dashboards such as giving and ministry health, but it did not yet have a unified reporting suite where leadership could move between member, event, and giving intelligence with one consistent visual and filtering model.

`2.7.0` closes that gap with a shared reporting shell and three real analytical surfaces.

The new reports are intentionally not generic business dashboards. Member reporting emphasizes attendance momentum, engagement mix, and quiet-drift visibility. Event reporting highlights turnout, visitor touches, category yield, and volunteer pressure. Giving reporting adds donor-journey and fund-breakdown visibility while preserving anonymous-giving protections.

Just as importantly, this release tightens the preview and reduced-backend story. The giving and communications loaders now fail safely when tenant Supabase environment variables are absent, which keeps the application usable during local preview work instead of crashing on server render.

## [2.6.0] - 2026-04-14

### Added

- Added Sprint 2 tenant migration `20260420000000_sprint2_attendance_identity_flow.sql`, which decouples offline `profiles` from `auth.users`, adds `member_number`, `account_status`, and `is_roster_eligible`, extends `attendance` with `church_id` and `check_in_method`, creates `event_rosters` and `account_requests`, tightens attendance RLS to church-admin / pastor management scope, and attaches audit triggers for attendance, rosters, and account-request changes.
- Added public portal registration at `/portal/register` plus a public `/portal` landing page, backed by `list_portal_churches()` and `submit_account_request(...)` RPCs for church selection and request submission without exposing tenant profile tables directly.
- Added `/app/church-admin/accounts` with a church-admin approval queue for public portal requests, including existing-member linking, generated member numbers, and invite delivery when a tenant Supabase service-role key is configured.
- Added `/app/church-admin/events/[id]` for event-specific roster and attendance management, including roster assignment, confirmation toggles, quick member check-in, quick-add visitor + check-in, seven-day burnout warnings, and care-follow-up prompts with the standard AI disclaimer.
- Extended the member portal data model and `/app/member` home so members can view attendance history, upcoming serving assignments, and edit `preferred_contact_method` plus `interests`.

### Changed

- Changed `/portal` from an authenticated redirect-only entry into a public landing page with sign-in and request-access entry points.
- Changed the calendar event drawer so church-admin and pastor users can jump directly into the new event attendance / roster workspace.
- Changed `inviteUserAction` to use the tenant service-role client when available and to wire invited users back into church memberships and tenant profile records instead of sending an auth invite only.

### Fixed

- Fixed member profile updates to persist `interests` alongside preferred contact method and other self-service profile fields.
- Fixed the tenant profile-auth alignment model so new auth users can merge onto existing offline profiles by email instead of always creating a second record.

### Release Notes

This release closes the gap between church-admin people management and a usable member-facing identity flow.

Before `2.6.0`, ChurchCore Ops could manage tenant people records and send direct invites, but the product did not yet support the more realistic church workflow where:

- someone is known to the church before they have an auth account
- a member requests portal access from a public page
- an admin reviews that request in tenant context
- the approved member receives a church-scoped invitation
- weekend event operations need rosters and check-in in the same place

`2.6.0` introduces that missing connective tissue.

The largest architectural shift in this release is the move from auth-coupled profiles to offline-capable profiles. `profiles.id` is no longer forced to equal `auth.users.id`; instead, `profiles.user_id` becomes the optional auth linkage. That lets ChurchCore Ops create visitor and member records first, then attach an auth user later during invitation or first account activation. This is the foundation that makes public portal requests, event visitors, and roster-first operations practical.

The public portal is now a real product surface. `/portal` is no longer just a protected redirect. It is now a public landing page with a clear split between existing sign-in and new access requests. `/portal/register` submits church-scoped requests with only the minimum identity fields required for review. Those requests are stored in `account_requests` and optionally linked to an existing member profile by matching email within the church boundary.

On the church-admin side, `/app/church-admin/accounts` becomes the approval workspace for this new flow. Pending requests can be reviewed, approved, or rejected. Approval generates a collision-checked `member_number`, upgrades or creates the tenant profile, and sends a Supabase invitation when the tenant service-role key is available. In preview or reduced-backend mode, the record changes still occur but invite delivery is intentionally skipped with clear UI feedback.

Weekend and event operations also deepen significantly in this release. `/app/church-admin/events/[id]` is a dedicated event workspace that combines roster management and attendance tracking instead of leaving those tasks spread across generic calendar editing and people screens. Church-admins and pastors can add roster entries with custom role titles, confirm assignments, check members in quickly, and create a visitor profile while logging attendance in the same action. The event drawer in the calendar now links directly into this deeper workspace for the roles that can manage it.

Member self-service expands as well. The main member home now exposes attendance history, upcoming serving assignments, member-number visibility, and richer profile updates including `interests`. This keeps the member portal aligned with the new identity and roster model instead of making attendance and serving admin-only concepts.

Security and tenant separation remain the controlling constraints across the release. Public request submission is mediated through explicit RPCs rather than raw table reads, attendance and roster access are narrowed to self or church-admin / pastor scope, and every new write-heavy table introduced by the release is attached to the existing audit trigger pattern. The implementation also continues to respect ADR 0002 by keeping these flows entirely in the tenant app and tenant data plane instead of crossing back into control-plane tables for day-to-day church operations.

## [2.5.0] - 2026-04-14

### Added

- Added **Add person** modal to the church-admin People page — creates an offline churchgoer record (name, email, phone, membership status, role) without requiring a Supabase auth account; suitable for walk-in visitors and paper-roll imports. Gracefully stubs in preview mode.
- Added **Invite user** modal — sends a Supabase auth invite email to a specified address so the recipient can sign in with a pre-assigned role (`member`, `ministry-leader`, `pastor`, `church-admin`). Displays an informational toast in preview mode when no backend is running.
- Added **Deactivate person** action inside each person's edit modal, under a "Danger zone" divider. Sets `membership_status = inactive`, hides from directory and contact lists, and deactivates all `church_memberships` rows for that person. Requires a confirm step before executing.
- Expanded the church-admin sidebar nav on both the home dashboard (`/app/church-admin`) and the People page (`/app/church-admin/people`) to include direct links to: Communications Hub, Giving Dashboard, and Ministry Forge.
- Added `addChurchgoerAction`, `inviteUserAction`, and `deactivateChurchAdminPersonAction` server actions in `app/app/actions.ts` with full local-DB and Supabase path support and church-admin session guards.

### Fixed

- Corrected `shouldUseLocalControlPlaneDbFallback` to guard `hasControlPlaneSupabaseEnv()` before calling `getControlPlaneSupabaseEnv()`, preventing a crash when no Supabase env vars are set.
- Added early null-return to `resolveTenantViewTarget` when no control-plane backend is configured (preview mode), eliminating a runtime 500 in `launchTenantViewAction`.
- Converted `TenantViewLauncher` and `ReturnToControlPlaneButton` from `<form action={...}>` to `useTransition` + try/catch + `notifications.show()` so server action errors surface as toasts instead of crashing the page.
- `TenantViewLauncher` now accepts `isPreview` from `ControlPlaneDashboard` (derived from `session.source === "preview"`) and disables the launch button with an explanatory tooltip when Supabase is not running locally.

## [2.0.0] - 2026-04-19

### Added

- Added Sprint 7+ Launch Readiness migration (`20260419000000_launch_readiness_sprint7.sql`): `donations` table (voluntary-only, Stripe-backed, full RLS, audit trigger); `ai_interactions` audit table (feature, disclaimer_shown, model; management-only RLS); `stripe_customers` lookup table; `data_export_requested_at`, `data_delete_requested_at`, `data_delete_approved_at` columns on `profiles` for GDPR/CCPA self-service.
- Added `lib/stripe/` module: `client.ts` (lightweight Stripe API caller, no heavy SDK dependency until church opts in) and `donations.ts` (`createPaymentIntent`, `createOrGetStripeCustomer`, `cancelStripeSubscription`) — all with graceful local-dev stubs when `STRIPE_SECRET_KEY` is absent.
- Added `lib/donations-data.ts`: `getDonorPortalData` (member giving history + total) and `getGivingDashboardData` (leader report by fund, monthly/all-time totals, recurring count).
- Added `app/app/donations-actions.ts`: `initiateDonationAction` (creates PaymentIntent + pending donations row), `confirmDonationAction` (marks succeeded + sends thank-you receipt email), `cancelRecurringDonationAction` (cancels Stripe subscription + marks cancelled). All giving uses voluntary language — no platform fee.
- Added Donor Portal at `/app/member/giving` — giving history table, active recurring gifts with cancel flow, and a Give drawer with fund designation, anonymous option, receipt email, and voluntary-language notice.
- Added Giving Dashboard at `/app/giving` (pastor and church-admin only) — this-month / all-time / recurring summary cards, recent gifts table, and fund breakdown with ring-progress allocation.
- Added `lib/compliance/data-rights-actions.ts`: `requestDataExportAction`, `requestAccountDeletionAction`, `cancelDeletionRequestAction`, `generateDataExportAction` (builds JSON export of profile, memberships, donations, consent logs, notification preferences). Staff accounts blocked from self-service deletion.
- Added `DataRightsPanel` component at `components/portal/data-rights-panel.tsx` — Download My Data (request + JSON download), Privacy Rights notice, Request Account Deletion with 30-day grace-period cancellation.
- Added Data Rights route at `/app/member/data-rights` — member-only; surfaces `DataRightsPanel` with current export/delete request state.
- Added Launch Checklist at `/control/launch-checklist` — interactive pre-launch verification checklist for platform operators covering RLS, donations, AI guardrails, communications, data rights, security, mobile/PWA, and role access (8 sections, 47 items, progress ring).
- Added Stripe env vars to `.env.example` (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`).

## [1.5.0] - 2026-04-18

### Added

- Added Phase 6 — Communications & Polish: `notification_preferences` table (per-member, per-church opt-in for email/sms/push/in-app channels) and `communication_logs` table (append-only outbound audit trail with channel, status, external provider ID, and body preview); both with RLS and audit triggers.
- Extended `consent_logs` with an optional `communication_type` column so consent records can be scoped to a specific channel.
- Added `lib/notifications/` module: `send-email.ts` (SendGrid Mail Send API wrapper with local-dev stub), `send-sms.ts` (Twilio Messages API wrapper with local-dev stub), `queue-communication.ts` (consent-aware dispatcher — checks `notification_preferences`, dispatches to the correct provider, writes a `communication_logs` audit row).
- Added Communications Hub at `/app/communications` — compose and broadcast messages to members by channel (email or SMS), filter recipients by role, bulk-select, preview consent/opt-out warnings before sending, schedule for a future time, and view the full message log with status badges. Visible to pastor and church-admin roles only.
- Added `broadcastMessageAction` and `updateNotificationPreferencesAction` in `app/app/communications-actions.ts`.
- Added `getCommunicationsHubData` data loader in `lib/communications-data.ts` with local-DB SQL and Supabase client paths.
- Added `NotificationPreferencesForm` reusable component for members to opt in/out of each notification channel from their profile.
- Added `/app/member/ministries` to the `MemberBottomNav` tab bar (Home, Calendar, Directory, Ministries, Family) and to the PWA offline cache list in `public/sw.js`.
- Added SendGrid and Twilio env var stubs to `.env.example` (`SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`).
- Added Phase 4 — Elders Discernment Room foundations: `elder_notes`, `discernment_sessions`, `prayer_requests`, `prayer_acknowledgements` tables with stricter-than-admin RLS via new `can_access_elder_data()` helper (pastor / elder role only — church admins explicitly excluded per `docs/plans/advanced-ministry-elders-pastor.md §9`).
- Added `council_notes` table for Pastor Council Forge with `note_type` enum (`general`, `sermon_outline`, `series_plan`, `council_minutes`, `sabbath_reflection`) and auto-incrementing version trigger; accessible by pastor and church-admin via `can_access_council_data()`.
- Added `prayer_acknowledgements` table with a unique `(prayer_request_id, profile_id)` constraint and a trigger that keeps `prayer_requests.prayed_count` in sync — full "I Prayed" audit trail without in-place counter mutation.
- Added full audit trigger coverage for all four Phase 4 tables via the existing `audit_log_changes()` function.
- Added Elders Discernment Room at `/app/elders/discernment` — private, pastor-only workspace with open / in-prayer / voting session list, elder notes panel, and create-session and add-note drawers.
- Added Discernment Session detail page at `/app/elders/discernment/[sessionId]` — per-session prayer wall with "I Prayed" one-tap acknowledgement, elder notes sidebar, live status controls (open → prayer → voting → closed), and AI Wisdom Prompt button.
- Added `PrayerWall` component: add-request modal with anonymous option, per-request "I Prayed" button with optimistic count update, purple heart indicator for acknowledged requests.
- Added `AiWisdomPrompt` component: theological guardrail modal that surfaces Scripture references and reflection questions only — never recommendations or decisions. Disclaimer shown before and after every AI output per `§6`. Only the topic text is sent — no member data, notes, or PII.
- Added `DiscernmentSessionCard` component with status badge, date, prayer-request count, and "Enter room" link.
- Added Pastor Council Forge at `/app/council/forge` — collaborative versioned notes workspace for pastor and church-admin roles with tabbed views by note type, create and edit drawers, version badge on every save.
- Added `CouncilForge` component with per-type tabs, note cards with version history, and a stubbed liturgical calendar integration note (Phase 5).
- Added `lib/elders-types.ts` with shared types (`DiscernmentSession`, `PrayerRequest`, `ElderNote`, `CouncilNote`), status colour/label maps, and `ELDER_AI_DISCLAIMER` constant.
- Added `lib/elders-data.ts` with `getDiscernmentRoomData`, `getDiscernmentSessionDetail`, and `getCouncilForgeData` data loaders (local SQL + Supabase paths; role assertions at application layer in addition to DB RLS).
- Added six server actions in `app/app/elders-actions.ts`: `createDiscernmentSessionAction`, `updateDiscernmentSessionStatusAction`, `addPrayerRequestAction`, `markPrayedAction`, `addElderNoteAction`, `generateWisdomPromptAction` (stubbed with approved theological guardrail prompt template in code comments), `createCouncilNoteAction`, `updateCouncilNoteAction`.
- Added Ministry Forge Phase 3 — AI Volunteer Matcher and Burnout Guardian: `volunteer_match_suggestions` and `burnout_alerts` tables with strict RLS; `profiles.current_ministry_load` denormalised counter kept in sync by a PostgreSQL trigger on `profile_ministries`.
- Added `suggestVolunteersAction`: rule-based volunteer scorer (0–100 match score) using spiritual gift alignment, ministry type mapping, and serving-load penalty. Architecture prepared for LLM replacement with an approved guardrail prompt template in code comments.
- Added `reviewVolunteerMatchAction`: human-gated approve/reject flow — approval writes to `profile_ministries` and records reviewer identity and timestamp; rejection only marks the suggestion, never touches memberships.
- Added `calculateBurnoutAlertsAction`: re-evaluates member load for a ministry, persists `burnout_alerts` rows (deduplicated within a 7-day window), threshold: >3 ministries = medium, >5 = high.
- Added `acknowledgeBurnoutAlertAction`: marks a burnout alert as acknowledged.
- Added `VolunteerMatcherPanel` component: interactive Burnout Guardian section (severity-sorted alerts with acknowledge) and Volunteer Matcher section (pending suggestions with score ring, gifts, approve/reject).
- Added `MatchSuggestionCard` and `BurnoutAlertCard` sub-components with per-card optimistic removal on review.
- Added `AiDisclaimer` component rendering the canonical AI-assistive disclaimer on every AI-generated surface.
- Added "Volunteer Matcher" tab to `MinistryForgeDashboard` — visible to church-admin and pastor roles only; panel is empty-state friendly ("No suggestions yet — pray and try matching").
- Added `AI_ASSISTIVE_DISCLAIMER`, `burnoutSeverity()`, `BURNOUT_THRESHOLD_MEDIUM`, `BURNOUT_THRESHOLD_HIGH` constants to `lib/ministry-forge-types.ts` for shared use across server and client code.
- Added `getVolunteerMatcherData` data loader in `lib/ministry-forge-data.ts` with both local-DB SQL and Supabase client paths.
- Added `computeMinistryBurnoutAlerts` pure function for in-memory burnout detection without DB writes.
- Added Ministry Forge Phase 1 and Phase 2 foundations: `ministry_type`, `vision_statement`, and `scriptural_anchor` columns on `ministries`; new `profile_ministries` join table with composable RLS; `ministry_health_history` for trend tracking; `kingdom_impacts` quick-log table for spiritual outcomes.
- Added Ministry Forge dashboard at `/app/church-admin/ministry/[id]` with Overview, Members & Volunteers, Impact Log, and Vision & Anchors tabs for church admins and pastors.
- Added `HealthScoreCard` component with color-coded health bands (green ≥ 7.5, yellow 5–7.4, red < 5), trend arrow, and recent history.
- Added `VisionBoard` component with editable vision statement and scriptural anchor chips.
- Added `KingdomImpactLogModal` floating action button for logging prayer answers, disciples made, salvations, and restored relationships — visible to management roles only.
- Added `BurnoutGuardianBanner` component warning leaders when any volunteer serves in more than 3 ministries, with AI-assistive disclaimer.
- Added `MinistryCard` component with health score ring, ministry type badge, and member count.
- Added member-facing ministries route at `/app/member/ministries` listing the calling member's ministry assignments and all church ministries.
- Added seven new server actions in `app/app/actions.ts`: `createMinistryAction`, `updateMinistryAction`, `deleteMinistryAction`, `assignMembersToMinistryAction`, `removeMemberFromMinistryAction`, `updateMinistryHealthScoreAction`, `logKingdomImpactAction`, `updateMinistryVisionAction`.
- Added `lib/ministry-forge-data.ts` with `getMinistryForgeList`, `getMinistryForgeDetail`, and `getMemberMinistriesData` data loaders with both Supabase and local-DB fallback paths.
- Added rule-based Health Score formula as Phase 2 foundation (attendance × 0.4 + engagement × 0.3 + retention × 0.2 + impact × 0.1); Phase 3 will make it AI-assisted.
- Added `docs/plans/advanced-ministry-elders-pastor.md` to document the advanced ministries, elders, and pastor-council feature direction and its AI guardrails.
- Added `docs/plans/churchgoer-data.md` to document the churchgoer data model, directory rules, and self-service portal direction.
- Added `docs/churchgoer-pastor-execution-plan.md` to define the current implementation sequence for churchgoer and pastor data work.
- Added `docs/UI-UPDATES.md` to document the approved blue-neutral UI direction, component rules, and the current dark-mode deferral.
- Added dedicated member routes for `/app/member/directory` and `/app/member/family`, plus a pastor people route at `/app/pastor/people`.
- Added `/app/church-admin/people` and `docs/church-admin-people.md` for tenant-backed ChurchAdmin people management.
- Added bulk ChurchAdmin people actions for selected records, covering membership status and privacy visibility updates.
- Added ChurchAdmin household reassignment and duplicate-profile merge foundations, including the merge SQL function and relationships UI.
- Added `docs/pastoral-care-foundation.md` to document the new pastoral notes and care assignment scope.
- Added ADR 0002 in [docs/adr/0002-control-plane-and-tenant-separation.md](docs/adr/0002-control-plane-and-tenant-separation.md) to make control-plane and tenant separation the approved architecture.
- Added a control-plane tenant-registry migration for `tenants` and `tenant_connections`, including bootstrap data copied from existing church records.
- Added runtime-routing metadata backfill for `tenant_connections.metadata.runtime_church_id` and `runtime_slug`.
- Added server actions for tenant calendar event create, update, and delete flows, including local direct-Postgres fallback support.
- Added tenant calendar RSVP mutation actions backed by `event_rsvps` records.
- Added custom Mantine-based month, week, and day calendar rendering in the tenant calendar surface with smooth navigation and category filtering.
- Added animated hero icon component (`ChurchCoreOpsHeroIcon`) to the landing page with pulsing rings and community-focused visual design.
- Added `/portal` as the dedicated churchgoer portal entry route and added a pastor-specific workspace backed by tenant people data.
- Added `consent_logs`, profile interests, profile spiritual gifts, and attendance online support in a new tenant people-foundation migration.
- Added a tenant migration for member-safe family self-service policies and aligned self-profile updates to `user_id` semantics.
- Added a tenant pastoral-care migration with `pastoral_notes`, `care_assignments`, and pastor-only RLS through `can_access_pastoral_data`.

### Changed

- Changed pastor portal home so each led-ministry card links directly to the Ministry Forge dashboard.
- Retired `churchgoer_implement.md` so `docs/plans/churchgoer-data.md` is now the only churchgoer data source-of-truth document.
- Changed the member portal data layer to include family and directory context instead of only profile, ministries, and upcoming events.
- Changed the member home screen to a lighter overview and moved directory and household detail into dedicated routes.
- Changed the pastor data layer to expose a fuller people list for dedicated directory and follow-up screens.
- Changed the pastor people screen from a read-only directory into a real care workspace with confidential notes, active care assignments, and status updates.
- Changed the ChurchAdmin role from a preview-only operations surface into a mixed mode with a real tenant-backed people-management route and editable churchgoer records.
- Changed member, pastor, and ChurchAdmin people queries to retire merged profiles from normal directory and care views.
- Changed control-plane entry so unauthorized or wrong-account access now forces a visible sign-in flow instead of silently redirecting away from `/control`.
- Changed the protected-shell header to show a visible `Log out` action instead of requiring sign-out through the profile dropdown.
- Updated the Mantine theme and global UI tokens to a blue-neutral, higher-contrast system aligned to the new UI guidance.
- Restyled the shared application shell, session controls, landing page, and `/control` around the updated palette and a simpler visual hierarchy.
- Documented the current UI direction in the README so future visual changes have an explicit repo-level reference.
- Updated the development plan, README, `.env.example`, and TODOs so the repo no longer treats one shared control-plane-plus-tenant database as the target architecture.
- Split the backend access layer in code into control-plane and tenant wrappers, and moved the session, audit, control-plane, and tenant data loaders onto those scoped paths while retaining transitional shared-env fallback.
- Changed control-plane tenant launch to resolve from registry `tenantId` records and `tenant_connections` instead of posting church runtime IDs directly from the UI.
- Changed control-plane routing, session tenant-view hydration, and dashboard resolution to use `tenant_connections.metadata.runtime_church_id` instead of relying on `tenants.external_tenant_id` during launch.
- Extended the live tenant calendar board to include quick-add event creation, in-drawer event editing and deletion, and user RSVP controls.
- Extended tenant calendar data hydration to include each viewer's current RSVP status per event.
- Changed the tenant calendar to open day details directly from calendar cells and week slots, improved agenda snapshot usefulness, widened the calendar data window, and refreshed the event mutation flow so create, update, delete, and RSVP actions give immediate feedback.
- Upgraded the tenant calendar board from a list-only surface to an interactive month/week/day calendar with category filtering including an "all" option.
- Replaced FullCalendar dependency with custom Mantine-based calendar implementation for improved control and styling consistency.
- Updated landing page hero section: improved tagline to "Clarity for the mission you lead" and renamed action buttons to "ChurchCore Ops App" and "ChurchCore Ops Tenant Control" for better clarity.

## [1.0.0] - 2026-04-11

### Added

- Added a `/controll` compatibility redirect to `/control`.
- Added `docs/setup/local-supabase.md` to document the current local Supabase development URLs, keys, storage settings, and app env mapping.
- Added Supabase SSR foundations including browser and server helpers, a root `proxy.ts`, and an auth confirmation route.
- Added `.env.example` plus an initial Supabase SQL migration for profiles, churches, memberships, ministries, events, RSVPs, and volunteer shifts with RLS foundations.
- Added preview sign-in scaffolding with cookie-backed protected-route flow for the workspace and calendar modules.
- Added a role-based workspace preview under `app/workspace/` with distinct portal views for SuperAdmin, ChurchAdmin, Pastor / Elder, MinistryAdmin / Leader, and Volunteer / Member workflows.
- Added a protected working calendar module under `/calendar` for all-events breakdowns, volunteer load watch, approvals, and resource conflict visibility.
- Added a deeper ChurchAdmin portal board with care queue, weekend readiness, communications, and giving snapshot sections.
- Added `docs/auth-foundation.md` and `docs/working-calendar.md` to document the new protected shell and calendar module.
- Added `docs/church-admin-workspace.md` to document the first role-specific deep workspace.
- Added `docs/portal-foundation.md` to document the scope and intentional backend constraints of the new application slice.
- Added `docs/control-plane.md` to document the new platform-side control plane boundary and routes.
- Added `docs/todo.md` to track the remaining Supabase project hookup tasks after ADR 0001 approval.
- Added Mantine as the primary application-facing UI system for the landing page, sign-in flow, app shell, workspace, and calendar surfaces.
- Added membership-aware app-context resolution plus explicit tenant-view actions so control-plane users can intentionally enter and exit a church-app context.
- Added a second Supabase migration for `tenant_view_audit_logs` so platform-side tenant view entry and exit can be audited.
- Added a live church-calendar data loader backed by Supabase `events` records, category counts, and approval-queue derivation.

### Changed

- Updated the source-of-truth plan and README so Mantine is the standard UI framework for ChurchCore Ops going forward.
- Merged `DEVELOPMENT_PLAN.md` v1.4 with the new sprint roadmap, Sprint 1 schema priorities, categorized calendar direction, and updated source-of-truth structure.
- Updated the README to reference the v1.4 development plan and its Sprint 1 priorities.
- Started Sprint 1 execution by aligning the local Supabase schema toward member-portal profiles, ministry assignments, and categorized events, and by hydrating church-app sessions from live `profiles` rows when available.
- Added the first real member portal slice under `/app/member`, backed by live `profiles`, `profile_ministries`, and categorized `events` data.
- Accepted ADR 0001 in favor of Supabase and updated the repo copy to reflect an approved backend path instead of an undecided one.
- Updated the sign-in flow to use Supabase SSR auth when configured, with the original preview identities retained only as a local fallback.
- Aligned package metadata naming on `ChurchCore Ops` by updating the npm lockfile package name from the old bootstrap identifier to `churchcore-ops`.
- Updated the landing page to route into sign-in, workspace, and calendar entry points so the repo now includes a protected application surface alongside the marketing shell.
- Redesigned the protected application UI with a premium dashboard shell, stronger sidebar navigation, denser metric cards, and more intentional ChurchAdmin and calendar operating surfaces.
- Redesigned the landing page and sign-in route to match the stronger product direction, and added stateful dashboard interactions for role switching, queue views, and calendar filtering.
- Added segmented operation lanes, detail drawers, and local mutation flows to the ChurchAdmin workspace and calendar board so those surfaces behave more like real application modules.
- Added cookie-backed preview persistence with server actions for ChurchAdmin and calendar mutations so state now survives refresh and navigation before Supabase records are connected.
- Rebuilt the primary product surfaces on Mantine with a lighter, more restrained interaction model and reduced visual clutter across the landing, sign-in, workspace, and calendar experiences.
- Split the product into a real platform control plane under `/control` and a tenant-facing church app under `/app`, with legacy `/workspace` and `/calendar` routes retained only as compatibility redirects.
- Changed church-app navigation and route guards to resolve from the active app context instead of letting roles and product surfaces blur together.
- Changed the control plane to read live church, membership, and tenant-view audit data from Supabase when configured, while preserving preview fallback locally.
- Simplified the main control-plane and church-app shells into a lighter, light-only Mantine experience with reduced copy, flatter surfaces, and less visual chrome.
- Simplified the role workspaces and ChurchAdmin surface further by removing the promo-style metrics, heavier explainer copy, and extra dashboard chrome.
- Simplified the sign-in flow into a single focused card and removed the extra explainer panels and preview-heavy copy.
- Rebuilt the landing page as a minimal entry screen and removed the heavy preview grids, role boxes, metrics, and marketing sections.
- Added a local direct-Postgres fallback for app-owned Supabase table reads and writes when the local PostgREST schema cache is unavailable.
- Replaced the preview calendar board with a live categorized event board backed by Supabase reads.
- Removed the unused `next-themes` dependency and kept the app on a light-only Mantine configuration.
- Replaced the placeholder development plan with a fully expanded v1.3 source-of-truth document covering project vision, RBAC portals, core features, AI ministry tools, calendar and volunteer workflows, security, SDLC discipline, and maintenance expectations.
- Updated the README and in-app development-plan references to align with the revised plan language and scope.
- Updated the pull request template and added feature and bug issue templates that require plan-section references, documentation impact notes, and security or AI review context.

### Fixed

- Fixed a Mantine theme-toggle hydration mismatch by deferring client color-scheme resolution until after the initial render, so SSR and client hydration stay aligned.

## [0.1.0] - 2026-04-09

### Added

- Bootstrapped the ChurchCore Ops frontend with Next.js App Router, TypeScript, and Tailwind CSS.
- Established a disciplined repo structure with `app`, `components`, `lib`, and `docs`.
- Added a polished landing page aligned with the ministry platform vision.
- Added shared UI primitives, theme support, and CI verification.
- Added project documentation baseline including the development plan and initial ADR scaffolding.
