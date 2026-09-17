# Council Agent 1: Database & API Audit — ChurchCore LMS

**Date:** 2026-06-18
**Auditor:** Agent 1 — Database & API State
**Status:** Complete

---

## 1. Migrations & Schema Inventory

The repository contains **77 database migrations** located under `supabase/migrations/`. 

* **Total CREATE TABLE statements audited**: 84 tables.
* **RLS Status**: 100% of tenant schema tables have Row Level Security (RLS) enabled. This is validated by the successful execution of `npm run audit:rls`, which checks that RLS is active on every table containing a `church_id` column.
* **Orphaned Tables** (Present in SQL migrations but missing corresponding active module/typescript definitions):
  * `ccm_badge_print_jobs`
  * `localization_activation_history`
  * `localization_catalog_versions`
  * `localization_locales`
  * `localization_review_decisions`
  * `localization_validation_reports`
  * `marriage_pulse_entries`
  * `ministry_tracks`
  * `stripe_customers`
  * `tenant_connections`
  * `track_health_metrics`
  * `volunteer_blocked_dates`
* **Phantom Tables** (Referenced in the TypeScript application but missing from migration tables):
  * `attendance_records` (referenced in `lib/communications/recipient-resolver.ts`)
  * `burnout_category_counts` (referenced in `lib/ministry-forge-data.ts`)
  * `demo_feedback` (referenced in `lib/control-plane-demo-feedback.ts`)
  * `discipleship_velocity` (referenced in `lib/ministry-forge-data.ts`)
  * `member_directory` (referenced in `lib/member-portal-data.ts` — acts as a database view, not a physical table)

---

## 2. Lib & Server Utilities Audit

Key modules identified in `lib/`:
* **`lib/auth.ts`**: Handles identity structures (`DemoProfile`, `AuthSession`), portal role mapping (`mapSupabaseRole`), and helper functions (`isChurchRoleId`). Solid type-safety, recently hardened to support platform control-plane context switches.
* **`lib/communications/`**: Implements Twilio, Resend, and SendGrid adapters with robust suppression list lookups.
* **`lib/shepherd-ai/`**: Implements AI-assisted concern scoring and workflow recommendations.
* **`lib/supabase/`**: Defines client/server initialization targets.
* **Gaps**: There is a lack of unit test coverage for the RPC methods located inside `lib/supabase/` that communicate directly with the local Supabase container during test runs.

---

## 3. API Routes Inventory

Key routes located under `app/api/`:
* `POST /api/ai`: Interacts with Anthropic Claude, scrubs user inputs of email patterns/UUIDs, and inserts session history into `hq_sessions`.
* `GET/POST /api/unsubscribe`: Unsubscribes members and persists suppressions.
* `POST /api/webhooks/stripe`: Processes checkouts and updates payment states.
* `POST /api/webhooks/twilio` & `POST /api/webhooks/resend`: Handles incoming delivery statuses.
* `POST /api/demo/feedback`: Logs observations with transaction advisory locks for rate limiting.

---

## 4. App Pages Inventory

All pages under `app/` are organized inside App Router folders. 

* **Stubs / Redirects Flagged**:
  * `app/page.tsx` redirect redirects straight to `/sign-in` if no user session is active.
  * `app/workspace/page.tsx` checks user session and redirects to the appropriate role-based home path.
  * `app/controll/` is an empty/orphaned directory with a single placeholder page.

---

## 5. Seed Data Assessment

Seed insert statements live in `supabase/migrations/20260713000000_hq.sql` and `supabase/seed.sql`.
* **Strengths**: The seeded datasets provide realistic mock tasks, risks, decisions, and profile logins (`sarah@churchcoreops.app`, `miriam@graceharbor.church`, etc.).
* **Gaps**: The seeds lack complex, concurrent volunteer schedules and multiple linked tenant church contexts, which are needed to stress-test the RLS separation boundaries.

---

## 6. Top 5 Critical Missing Pieces for MVP

1. **RPC Unit Tests**: Lack of direct database-level test coverage for the helper function `public.current_user_role()`.
2. **PII Cataloging**: No explicit database columns mapping representing PII vs non-PII, causing full-table scans during compliance erasure.
3. **Control Plane Isolation**: Inadequate boundary validation between the control-plane data registry and standard tenant tables.
4. **API Rate Limiting**: The POST routes under `/api/unsubscribe` and `/api/push` have no rate limits, rendering them vulnerable to abuse.
5. **Session Timeout Rules**: The active session tokens do not force logouts on inactive client pages.
