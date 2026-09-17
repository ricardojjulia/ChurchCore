# Council Agent 1: Database & API Audit — Council Review 6

**Date:** 2026-06-21  
**Auditor:** Agent 1 — Database & API State Audit  
**Status:** Complete  

---

## 1. Migrations & Table RLS Inventory

We analyzed the `supabase/migrations/` schema definitions:
- **Total Tables Created:** 103 tables.
- **Row Level Security (RLS) Coverage:** **100%**. All 103 tables have RLS enabled and successfully passed `npm run audit:rls`.
- **Anomalies and Mismatches (check:schema analysis):**
  - **Phantom Tables (in code, not in migrations):**
    - `attendance_records`: Referenced in [recipient-resolver.ts](file:///Users/rjulia/ChurchCore/lib/communications/recipient-resolver.ts). In migrations, the database reuses the `attendance` table instead of creating a duplicate `attendance_records` table. This is a critical runtime bug that will fail if a user tries to resolve recipients by attendance.
    - `burnout_category_counts`, `discipleship_velocity`, and `member_directory`: Identified as phantoms because `check-schema-alignment.mjs` only matches `create table` syntax and misses `create or replace view`. These are legitimate database views.
    - `demo_feedback`: A control-plane table dropped from the tenant migration registry to enforce clean isolation, but still referenced by active control-plane routines.

---

## 2. Lib & Server Utilities Gaps

We reviewed the `lib/` directory structure:
- **`lib/communications/`**: Contains providers (Resend, Twilio, SendGrid) and the `recipient-resolver.ts`. The resolver has a critical typo error (referencing the non-existent `attendance_records` table instead of `attendance`).
- **`lib/supabase/`**: Houses tenant client configurations and RLS role helpers. No missing utility coverage found.
- **`lib/shepherd-ai/`**: Oversees pastoral workflow score logic and threat mitigations. Fully covered with integration tests.

---

## 3. API Routes & Redirect Stubs

We mapped all route handlers under `app/api/`:
- **API Routings:**
  - `app/api/ai/route.ts` [POST] - Claude prompt gate proxy.
  - `app/api/control/db-health/route.ts` [GET] - Platform admin health metrics with 10s caching and statement timeouts.
  - `app/api/cron/communications-retry/route.ts` [POST] - Failed sends processor.
  - `app/api/cron/communications-scheduled/route.ts` [POST] - Scheduled sends dispatcher.
  - `app/api/cron/shepherd-ai/route.ts` [POST] - Batch concern scoring.
  - `app/api/push/subscribe/route.ts` [POST] - WebPush VAPID subscriber.
  - `app/api/unsubscribe/route.ts` [GET/POST] - Recipient unsubscribe HMAC validator.
  - `app/api/webhooks/resend/route.ts`, `sendgrid/route.ts`, `stripe/route.ts`, `twilio/route.ts` [POST] - Integration webhooks.
- **App Page Redirect Stubs:**
  - `app/controll/page.tsx`: Redirects to `/control`. An unnecessary physical page bundle that should be migrated to `next.config.ts` redirects.
  - `app/app/page.tsx`: Core index redirect pointing logged-in profiles to their role-specific home segment path (`session.homePath`).

---

## 4. Seed Data Verification

The demo seed dataset defined in `scripts/seed-demo.mjs` and SQL migration seeds is realistic and creates structured church profiles, sample members, small groups, volunteer schedules, and financial ledgers. However, the following is missing:
- No seed records for the new `push_subscriptions` table.
- No dummy data simulating `audit_log` records, which makes testing the retention pruning schedule difficult in localized staging environments.

---

## 5. Top 5 Database & API Gaps

1. **Resolve `attendance_records` Typo:** Update [recipient-resolver.ts](file:///Users/rjulia/ChurchCore/lib/communications/recipient-resolver.ts) to query the real `attendance` table.
2. **Enhance Schema Checker:** Update `check-schema-alignment.mjs` to parse and recognize Postgres Views (`create or replace view`), eliminating false-positive checks.
3. **Move Typo Redirects to config:** Deprecate `/controll` route directory and register it as a Next.js redirect block in configuration.
4. **Seed Audit Data:** Add mock audit logs in `seed-demo.mjs` to improve staging testability for pruning schedules.
5. **Verify Push Seed Capability:** Ensure mock profiles have push credentials seeded to test sessional volunteer reminders.
