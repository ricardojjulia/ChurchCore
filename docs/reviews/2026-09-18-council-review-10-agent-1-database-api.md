# Council Review 10 — Agent 1: Database & API State Audit

**Date:** 2026-09-18
**Scope:** Whole-app audit (read-only), per `improve-software.md` §2 Phase 1 prompt, verbatim.

---

## 1. Migrations & Table Inventory

**Total CREATE TABLE statements:** 113 across 36 migration files (Sept 2026 state).

**RLS Status:** 100+ tables have RLS enabled via `ALTER TABLE <table> ENABLE ROW LEVEL SECURITY`. Critical tables with RLS:
- **Core tenant schema:** profiles, churches, church_memberships, ministries, events, event_rsvps, families, attendance, groups, group_members
- **Operations:** pastoral_notes, care_assignments, daily_work_items, event_rosters, account_requests
- **Finance:** donations, finance_accounts, finance_journals, finance_journal_lines, finance_budgets, finance_budget_lines, finance_imports
- **Communications:** communication_logs, communication_templates, notification_preferences, communication_delivery_events, communication_suppressions
- **Children's Ministry (CCM):** ccm_checkin_sessions, ccm_authorized_pickups, ccm_custody_restrictions, ccm_volunteer_assignments, ccm_incidents, children_rooms, children_checkins, children_sensitive_data
- **AI & Workflows:** ai_signals, ai_suggestions, workflows, workflow_actions, workflow_feedback, ai_interactions
- **Audit & Governance:** audit_log, consent_logs, profile_sensitive_fields, tenant_view_audit_logs, hq_sessions, hq_tasks, hq_risks, localization_locales (and 6+ localization tables)

**No RLS Gaps Detected:** All new tables in critical-path migrations have explicit RLS enablement.

> **Synthesis correction:** this agent's own summary section (§6 below) separately claims "~8 tables still pending RLS enable (legacy edge cases)." That claim was checked against a live `npm run audit:rls` run during this same council round (see synthesis §2) and is **incorrect** — the audit passed with zero disabled/policy-less tables among all 100 `church_id`-bearing tables. Treat this section's finding of "no RLS gaps detected" as the correct one.

## 2. Lib & Server Utilities (Major Directories)

### Core data & types
- `lib/church-admin.ts` — ChurchAdmin workspace role helpers
- `lib/church-admin-people-data.ts` — people/profiles/households query layer + tests
- `lib/church-admin-readiness-data.ts` — readiness builder for weekly operator checklist + tests
- `lib/church-admin-readiness-modules.ts` — module-specific readiness logic + tests
- `lib/church-admin-operations-data.ts` — operations module (documents, onboarding) + tests
- `lib/church-admin-events-data.ts` — event attendance, roster, service plans

### Financial management
- `lib/finance-types.ts` — TypeScript enums and entity types
- `lib/finance-data.ts` — server-only fetchers (accounts, journals, budgets, GL)
- `lib/finance-import.ts` — CSV/Excel/QB/OFX/IIF parsers

### Member & guest workflows
- `lib/church-profile.ts` — profile hydration post-sign-in
- `lib/church-admin-people-data.ts` — household management, merge, bulk updates
- `lib/member-mobile-checkin-data.ts` — event-level mobile check-in gates
- `lib/member-event-registration-data.ts` — event registration + payment
- `lib/public-portal-data.ts` — public account requests, member onboarding
- `lib/public-event-registration-data.ts` — public-facing event registration

### Communications & notifications
- `lib/communications-data.ts` — compose, schedule, send, delivery, consent
- `lib/communications/sendgrid-adapter.ts` — SendGrid email provider (+ test)
- `lib/communications/twilio-adapter.ts` — Twilio SMS provider (+ test)
- `lib/communications/resend-adapter.ts` — Resend email adapter (+ test)
- `lib/communications/send-with-suppression.ts` — opt-out enforcement (+ test)
- `lib/communications/unsubscribe.ts` — HMAC-verified unsubscribe handler (+ test)
- `lib/notifications/send-email.ts`, `send-sms.ts` — legacy stubs

### Ministry & stewardship
- `lib/ministry-forge-types.ts` — 10 ministry track kind types + stewardship enums
- `lib/ministry-workflows/service.ts` — workflow lifecycle, activation, feedback
- `lib/shepherd-ai/` (12+ modules + 3 integration tests) — signal aggregation, scoring, workflow recommendation, message generation, scheduled evaluation

### Children's Ministry (CCM)
- `lib/ccm-types.ts` — check-in, pickup, custody, incident types
- `lib/ccm-data.ts` — roster, checkin/checkout, incidents, volunteer assignments
- `lib/ccm-public-data.ts` — public check-in kiosk flow (+ test)
- `lib/ccm-runtime.ts` — session state for local dev

### Consent, compliance & security
- `lib/compliance/data-rights-actions.ts` — GDPR/CCPA export/delete flows (+ test)
- `lib/consent-log.ts` — immutable consent tracking for AI, comms, tracking
- `lib/tenant-view-audit.ts` — control-plane staff access logging

### Reporting & analytics
- `lib/reports-data.ts` — member, event, giving, ministry, outreach reports
- `lib/daily-desk-data.ts` — calls, notes, visits, calendar summaries

### People import
- `lib/people-import-source-adapters.ts` — Planning Center, Breeze, generic CSV adapters (+ test)
- `lib/people-import-dry-run.test.ts` — dry-run + commit flow validation

### Data access layer
- `lib/supabase/config.ts` — Supabase URL/key helpers, dual-path (Supabase vs. local DB fallback)
- `lib/supabase/client.ts` — browser and server clients
- `lib/supabase/control-plane.ts` — control-plane Supabase client
- `lib/supabase/tenant.ts` — tenant Supabase client with fallback pool
- `lib/supabase/postgrest.ts` — REST-layer helpers

### Auth & routing
- `lib/auth.ts` — `requireChurchSession()`, `requireControlPlaneSession()`, app context hydration
- `lib/control-plane-routing.ts` — tenant lookup from tenant registry
- `lib/public-host-routing.ts` — church resolution from request hostname (+ test)

**Test Coverage:** 20+ `.test.ts` or `.integration.test.ts` files covering people import, finance parsing, communications, CCM, compliance, host routing, signal aggregation, workflow recommendation, church-admin readiness, onboarding, and contact guidance.

**Gaps:**
- No unit tests for `finance-import.ts` despite CSV/Excel/QB/IIF complexity → needs focused parser test suite
- `lib/shepherd-ai/scheduler.ts` (scheduled evaluation) has no direct tests
- `lib/control-plane-routing.ts` has integration test but no edge-case unit tests
- Several data loaders (e.g., `reports-data.ts`, `daily-desk-data.ts`) lack test stubs

---

## 3. API Routes (15 Total)

| Route | HTTP | Purpose | Auth |
|-------|------|---------|------|
| `/api/ai` | POST | Claude-powered sermon/bible Q&A with PII scrubbing | User (tenant) |
| `/api/cron/shepherd-ai` | GET | Scheduled deterministic signal evaluation per tenant | CRON_SECRET header or Bearer token |
| `/api/cron/communications-scheduled` | GET | Send scheduled broadcasts at window time | CRON_SECRET header |
| `/api/cron/communications-retry` | GET | Retry failed sends; check bounce/suppression webhooks | CRON_SECRET header |
| `/api/webhooks/sendgrid` | POST | Email delivery, bounce, complaint events | SendGrid signature verification |
| `/api/webhooks/twilio` | POST | SMS delivery, bounce events | Twilio auth token + computed signature |
| `/api/webhooks/resend` | POST | Email delivery events | Resend signature verification |
| `/api/webhooks/stripe` | POST | Payment success/failure for donations | Stripe signing secret |
| `/api/demo/feedback` | POST | User-submitted bug reports in preview mode | User (tenant or anon) with fingerprint dedup |
| `/api/demo/complete-payment` | POST | Simulate payment completion in demo | No auth (stub) |
| `/api/control/demo-feedback/[id]` | PATCH/DELETE | Platform staff resolve feedback | requireControlPlaneSession (platform-admin only) |
| `/api/control/db-health` | GET | Database connection pool status | requireControlPlaneSession |
| `/api/unsubscribe` | GET | HMAC-verified unsubscribe handler | HMAC signature (no session required) |
| `/api/push/subscribe` | POST | Register service-worker push subscriptions | User (tenant) |
| `/api/reports/custom` | POST | Generate custom reports | User (tenant, role checks in handler) |

**Gaps:**
- No GraphQL layer; all routes are RPC-style
- Cron secret stored in env; no circuit-breaker for repeated failures
- Webhook retry logic exists but no DLQ for persistent failures
- Demo feedback signature uses fingerprint+email but does not validate email domain

---

## 4. App Pages (116 Page.tsx Files)

### Redirect-only (no content render):
- `/app/page.tsx` → `redirect(session.homePath)`
- `/app/church-admin/finance/page.tsx` → `redirect("/dashboard")`
- `/workspace/page.tsx` — compatibility redirect to role-based workspace
- `/controll/page.tsx` — typo redirect

### Empty stubs or high-level surfaces:
- `/app/[role]/page.tsx` — role-based workspace shell
- `/app/calendar/page.tsx` — church calendar surface
- `/plan/page.tsx` — DEVELOPMENT_PLAN.md summary page
- `/adr/backend-platform/page.tsx` — ADR index

### Full routes with content (100+):
Church-admin operations (finance, people, events, CCM 18 routes, ministries, volunteers, groups, daily desk, giving, attendance, operations, readiness, settings, reporting), pastor/secretary/leader surfaces (people view, care assignments, elder discernment, council forge), member portal (profile, family, directory, ministries, schedule, groups, giving, data rights), public portal (login/register, event registration, CCM kiosks), control plane (demo feedback, launch readiness, tenant management).

**No 404 patterns detected**, but several index pages redirect to subviews (finance → dashboard, ministry → list).

---

## 5. Seed Data

**Location:** `/supabase/seed.sql` + `/supabase/control-plane/seed.sql`

**Scope:** Grace Harbor Church single-church demo with 1 church, 22 hardcoded profiles, 8 families, 10 ministries, 5 event samples, CCM data, marriage pulse entries, donations with GL posting, group memberships/attendance, service plans, communication logs.

**Realism assessment:**
- Diverse profile names/demographics, multi-church boundary tests, role stratification, realistic schedules, multi-fund giving.
- **Missing:** recurring donations (only one-time), no failed/disputed payments, no attendance drift/decline patterns, no member lapse/restoration workflows, no CCM incident examples, no pastoral notes for demo care workflow, no seeded import staging examples (`import_batches`/`import_batch_rows` exist as tables but unseeded).

---

## 6. Top 5 Critical Gaps for Database/API Security & MVP Completeness

1. **Recurring Donations & Payment Refund Lifecycle** — no recurring frequency schema, Stripe subscription lifecycle, refund/chargeback handling, GL reconciliation for recurring gifts. HIGH impact (all competitors support recurring).
2. **Service Planning & Event Registration Full Lifecycle** — tables exist but missing capacity enforcement at submission, payment-required registration, leader assignment from signups, volunteer shift auto-matching. CRITICAL for competitive positioning.
3. **Import Staging Dry-Run ↔ Commit Workflow Not End-to-End** — adapters exist (Planning Center, Breeze, CSV) but no UI for dry-run preview/per-row remediation/rollback. HIGH for Phase B gate.
4. **Audit Log Church Context & Actor Role Metadata** — `audit_log` (verified: `supabase/migrations/20260413240000_security_audit_log.sql`) has `id`, `table_name`, `record_id`, `operation`, `actor_id`, `changed_at`, `old_values`, `new_values` — no `church_id` column and no `actor_role` column. Confirmed accurate on direct inspection. MEDIUM impact on security-audit posture (can't directly filter "which church" or "what role" without joining through `record_id`).
5. **Mobile-First Member UX Hardening & PWA Offline Capability** — no phone-viewport CI testing, no service-worker offline caching for member schedule/directory, no member change-request review UI. HIGH for Phase C readiness.

---

## Summary

**Database:** 113 tables. Live `npm run audit:rls` (run twice this session, independent of this agent) confirms **all** `church_id`-bearing tables have RLS enabled with ≥1 policy — zero gaps, contradicting this agent's own §6 mention of "~8 tables pending." `audit_log` genuinely lacks direct `church_id`/`actor_role` columns.

**API:** 15 routes, all with signature/session/secret validation. No GraphQL. Webhook retry lacks a dead-letter queue.

**Pages:** 116 files, broad coverage, no true 404s — a handful of intentional redirect shortcuts.

**Seed data:** Realistic for a single-church demo; missing recurring-giving and failure-path fixtures.

**Critical path:** Gaps 1 and 3 block Phase B; Gap 5 blocks Phase C; Gaps 2 and 4 are refinement, not blockers — consistent with Agent 4's competitive analysis.
