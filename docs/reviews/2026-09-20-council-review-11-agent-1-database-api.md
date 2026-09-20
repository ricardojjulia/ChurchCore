# Council Review 11 — Agent 1: Database & API Audit

**Date:** 2026-09-20 | **Branch under review:** `feature/landing-page-sacred-clarity`
**Scope note:** This branch touches only `app/page.tsx`, `app/page.test.tsx`, `lib/i18n.ts`, and docs — no database, migration, or API surface changes. Agent 1 ran the standard whole-app Phase 1 prompt regardless, per `improve-software.md`; nothing below is introduced by this branch except where explicitly marked.

> Operational note: this agent's run terminated on an account-level rate limit after producing the full report below (not a partial/truncated answer — it reached its own summary section). Treated as complete for synthesis purposes.

## 1. Migrations & Table Inventory

113 `CREATE TABLE` statements across 89 migration files. **100% RLS coverage** — 114 `alter table ... enable row level security` directives, matching or exceeding the table count. No table found without a corresponding RLS-enable statement. All tenant-scoped tables carry `church_id`; control-plane tables (`tenants`, `tenant_connections`) carry platform-admin-only policies.

## 2. Lib & Server Utilities

- `lib/supabase/` — control-plane/tenant client split (ADR 0002), no dedicated unit tests (covered via consumer integration tests).
- `lib/communications/` — provider adapters (SendGrid, Twilio, Resend) + suppression-aware send path; full `*.test.ts` coverage.
- `lib/shepherd-ai/` — AI orchestration, signal scoring, suggestion generation; unit + integration tests present.
- `lib/compliance/` — GDPR/CCPA data-rights actions; tested.
- Data loaders (`church-admin-*-data.ts`, `member-portal-data.ts`, `finance-data.ts`, etc.) — extensive, mostly tested; **gap repeated from Council Review 10**: no unit tests for `lib/finance-import.ts` parser functions (CSV/Excel/OFX normalization).

## 3. API Routes (15 total under `app/api/`)

Webhooks (SendGrid, Twilio, Resend, Stripe) use signature verification. Cron routes use header-based verification. Session-gated routes (`/api/ai`, `/api/push/subscribe`, `/api/reports/custom`) check auth. No orphaned routes; no route lacking any auth/signature mechanism. Gap: no explicit CSRF token layer on state-changing POST routes (pre-existing, whole-app, not introduced by this branch).

## 4. App Pages

116 `page.tsx` files. Zero empty stubs. 98 pages use `redirect()` as intentional role/session routing, not placeholder stubs.

## 5. Seed Data

`scripts/seed-demo.mjs` provides a realistic multi-role, multi-family demo dataset (Grace Harbor Church) with events, RSVPs, finance journals, and volunteer shifts. Gaps: no seeded AI-tool interactions, no communications history/suppression examples, sparse children's-ministry check-in sessions, no onboarding workflow instances.

## 6. Top 5 Whole-App Gaps (pre-existing, not introduced by this branch)

1. No unit tests for `lib/finance-import.ts` parsers (repeat, Council Review 10).
2. No dead-letter queue / retry mechanism for failed webhook processing (Stripe refund loss risk).
3. `MemberBottomNav` missing `aria-current="page"`; no `loading.tsx` anywhere in `/app` (repeat, Council Reviews 9 & 10 — see Agent 3's report, this round).
4. `audit_log` church_id/actor_role backfill coverage on older rows not fully verified.
5. No CSRF token layer on state-changing API routes.

## Summary

No database, migration, or API changes on this branch — nothing in this section blocks the landing-page merge. All five gaps above are carried-forward, already-tracked backlog items (see `DEVELOPMENT_PLAN.md`'s "Current Status" log for Council Reviews 9–10), not new findings against this branch's actual diff.
