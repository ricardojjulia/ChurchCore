# Council Agent 1: Database & API State Audit

**Branch audited:** `fix/error-boundaries-finance-tests-member-route`

## Executive Summary
MVP readiness 65/100 (Phase A GO; Phase B-D NO-GO pending real-world pilot + competitive gaps). All 114 tables protected by RLS; audit logging live; financial module complete with journal-posting framework. Schema is comprehensive but test coverage for critical workflows is incomplete.

---

## 1. Migrations & Tables

**Count**: 88 migration files, 114 CREATE TABLE statements.
**RLS Status**: ALL 114 tables have `alter table ... enable row level security`. No gaps detected.

**Core Modules** (by emergence date):
- **Platform Foundation** (20260409): profiles, platform_admins, churches, church_memberships, ministries, events, event_rsvps, volunteer_profiles, volunteer_shifts
- **Financial** (20260417): finance_accounts, finance_journals, finance_journal_lines, finance_budgets, finance_budget_lines, finance_imports
- **Communications** (20260418, 20260528): notification_preferences, communication_logs, communication_dlq, communication_delivery_events, communication_suppressions, communication_templates
- **Children's Ministry (CCM)** (20260501): ccm_services, ccm_checkin_sessions, ccm_authorized_pickups, ccm_custody_restrictions, ccm_volunteer_assignments, ccm_incidents, ccm_badge_print_jobs, ccm_session_enablement_overrides, ccm_public_session_attempts, children_rooms, children_checkins, children_sensitive_data
- **Ministry Tracks & Health** (20260414, 20260421): ministry_health_history, kingdom_impacts, ministry_tracks, track_health_metrics, worship_songs, worship_rehearsals, mentorship_pairs, discipleship_groups, life_stage_circles, support_pairings, mentor_couples, marriage_cohorts, mission_partners, mission_trips
- **Service Planning & Volunteers** (20260504, 20260530): service_plans, service_plan_positions, service_plan_templates, service_plan_items, volunteer_blocked_dates, volunteer_hours_log, volunteer_shift_reminders, volunteer_match_suggestions, burnout_alerts
- **Events & Registration** (20260503, 20260530): event_registration_settings, event_registrations, event_rosters, event_registration_payments, event_registration_form_fields
- **Attendance & Groups** (20260411, 20260420, 20260502): families, attendance, service_attendance, first_time_visitors, groups, group_members, group_meetings, group_attendance, group_resources
- **AI & Governance** (20260419, 20260505, 20260608, 20260712): ai_interactions, ai_signals, ai_suggestions, workflows, workflow_actions, workflow_feedback, localization_governance
- **Security & Audit** (20260412, 20260413, 20260414): consent_logs (immutable), pastoral_notes, care_assignments, profile_sensitive_fields, audit_log (with church_id, actor_role, READ operation logging), elder_notes, discernment_sessions, prayer_requests, prayer_acknowledgements, council_notes
- **Operations** (20260509, 20260607): daily_work_items, church_documents, onboarding_templates, onboarding_template_steps, onboarding_instances, onboarding_instance_steps
- **Imports & Registry** (20260411, 20260529): tenants, tenant_connections, import_batches, import_batch_rows
- **Donations & Giving** (20260419, 20260502): donations, stripe_customers, giving_fund_accounts, donation_gl_posts, public_giving_pages
- **Account & Identity** (20260413, 20260420, 20260527): member_change_requests, account_requests, push_subscriptions, profile_ministries

**Access Pattern**: All tables scoped to `church_id` via foreign key + RLS. Helpers: `can_manage_church()`, `belongs_to_church()`, `can_manage_communications()`, `is_platform_admin()`.

---

## 2. Lib & Server Utilities

| Directory | Test Coverage | Gaps |
|-----------|----------------|------|
| `lib/supabase/` | config.test.ts only | Tenant client tests missing |
| `lib/shepherd-ai/` | 4 tests | No test for workflow-recommender logic; scheduler lacks e2e coverage |
| `lib/communications/` | 8 test files | Retry-eligible/DLQ and webhook signature verification covered; no integration test for multi-provider send |
| `lib/finance-*.ts` | finance-import.test.ts (27 tests, Council Review 12); finance-actions.test.ts batch-commit describe block (3 tests, this branch) | Parsers and batch-commit action tested; see §6 for a correction to how this gap was originally characterized |
| `lib/church-admin-*.ts` | 3 test files | Duplicate-candidate detection untested |
| `lib/ministry-workflows/` | service.integration.test.ts only | No unit tests for action execution or conflict detection |
| `lib/portal.ts` | public-host-routing.test.ts only | Portal-facing member lookups untested |
| `lib/ccm-*.ts` | ccm-public-data.test.ts only | Runtime checkin session lifecycle untested |
| `lib/groups-*.ts` | No test file | Import dry-run logic untested |
| `lib/reports-data.ts` | No test file | Custom report builder untested |
| `lib/compliance/` | data-rights-actions.test.ts | Async job scheduling untested |
| `lib/member-*.ts` | No test files | Checkin flow + event-registration workflow untested |

**Patterns**: All use `createTenantServerClient()` (Supabase) with fallback to `queryTenantLocalDb()` for local dev (deprecated per the Supabase-only mandate, kept as a kill-switch). Service-role client used for background jobs (cron, webhooks).

---

## 3. API Routes (23 files)

No orphaned handlers found. Notable gaps: no GET endpoint for retrieving scheduled communications; no direct event-registration payment-processing endpoint (uses Stripe webhook only).

---

## 4. App Pages (116 total)

No empty stubs identified. All redirect-pattern pages (`/app/page.tsx`, `/app/church-admin/finance/page.tsx`, etc.) are intentional role/intent routing, not stubs. `app/app/[role]/page.tsx` is a dynamic catch-all that correctly serves `/app/member`, `/app/pastor`, `/app/church-admin` when no literal static `page.tsx` exists at that path — confirmed this is by design, not a 404 risk (see Agent 2's report for the route-by-route check).

---

## 5. Seed Data

37 INSERT statements across migrations — minimal, schema-setup only. No realistic demo member/contact/finance-account seed. Real onboarding relies on `scripts/provision-tenant.mjs` (`npm run provision:tenant`), not a seed dataset. Unchanged since Review 12; not evaluated further on this branch since it wasn't touched.

---

## 6. Top Findings for This Branch

### 1. Error boundary hierarchy — now closed at the three root segments
`app/app/error.tsx`, `app/portal/error.tsx`, `app/control/error.tsx` now exist (this branch), delegating to a shared `PageErrorBoundary` component that reports to Sentry and offers `reset()`. This closes the specific Review 12 finding ("only `app/global-error.tsx` exists"). **Deferred, non-blocking:** no intermediate `error.tsx` below these three roots — an error in `/app/church-admin/finance/accounts/[id]` still bubbles to the `app/app/error.tsx` boundary rather than a feature-scoped one. This is a real but low-severity gap (a working boundary at the next level up still catches it; it just loses finer-grained context).

### 2. Finance-import batch-commit test coverage — needs a correction from other agents' framing
`importFinanceRowsAction` (`app/app/finance-actions.ts`) now has 3 new tests in `app/app/finance-actions.test.ts` covering the local-fallback path, Supabase path, and debit/credit account-code resolution — each asserting the exact `finance_journal_lines` rows inserted (account id, side, amount, sort order). In a double-entry system, those journal-line rows **are** the general ledger; I looked for a separate "GL auto-posting" background process (cron job or Supabase function) that would run after `postJournalAction` and found none — `postJournalAction` only flips `finance_journals.status` from `draft` to `posted`; no cron under `app/api/cron/` touches finance journals, and the only GL-adjacent background/webhook path is `donation_gl_posts`, which belongs to the separate Stripe-donation flow, not finance-import. Read this as: **the new tests do verify the debit/credit GL-entry content of a committed import**, and the previously-open "batch-commit/GL-posting workflow... still has no test coverage" line from `DEVELOPMENT_PLAN.md`'s Review 12 entry is now closed for the commit-and-post-journal-lines behavior that exists in code. There is no separate, additional "GL auto-posting" step being left untested — because it doesn't exist as code. (Agents 3 and 4 characterize this as a continuing gap; I read the source and don't find the thing they describe. See the synthesis for how this was resolved.)

### 3. Phone-first mobile UX, service-planning admin workflow, real-world pilot validation
Unchanged from Review 12 — not evaluated further since this branch didn't touch them. See Council Review 9's Agent 4 report and the competitive-roadmap memory for the ranked backlog.

---

## Risks & Conflicts

- **Tenant Boundaries**: Solid. All 114 tables scoped via `church_id` FK + RLS. No cross-church leakage detected.
- **RLS Coverage**: 100% (114/114 tables enabled), unchanged from Review 12 — no new tables on this branch.
- **Finance**: Double-entry ledger working; the new tests directly assert debit/credit journal-line content for the import-commit path. No separate GL-posting background process exists to test.
- **Children/Youth Safety, Communications, AI/Shepherd**: Unchanged from Review 12 — not touched by this branch.
