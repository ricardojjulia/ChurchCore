# Council Review 12 — Agent 1: Database & API State Audit

**Date:** 2026-09-20
**Scope:** Whole-app audit (read-only), per `improve-software.md` §2 Phase 1 prompt, verbatim.

---

## 1. Migrations & Tables

114 CREATE TABLE statements across 37 migration files (2026-04-09 to 2026-09-20). All 114 tables have RLS enabled.

Key clusters: Core (9), Control Plane (2), Pastoral & Care (2), Communications (4, including the new `communication_dlq`), Finance (6), Children's Ministry (7), Groups & Giving (10), Ministry Tracks (14), Volunteer & Events (9), AI & Governance (8), Audit & Security (9), Other (9).

`audit_log` confirmed to include `church_id` and `actor_role` columns (migration 20260607030000) — this contradicts Council Review 10's deferred finding that these columns were missing; see synthesis for reconciliation.

## 2. Lib & Server Utilities

46 files examined across `lib/supabase/`, `lib/communications/`, `lib/shepherd-ai/`, `lib/finance-import.ts`, `lib/notifications/`, `lib/compliance/`, `lib/church-admin-*`, `lib/ccm-*`, `lib/actions/`, `lib/crypto/`, `lib/localization-governance/`, `lib/i18n.ts`.

**Test coverage gaps identified:**
- `lib/shepherd-ai/scheduled-jobs.ts` — no unit tests
- `lib/notifications/send-email.ts` — no direct unit test
- Finance-import **batch-commit** logic (writing to `finance_journals`/`finance_journal_lines`, GL posting) — not tested (distinct from the parser functions, which are tested)
- Erasure audit trail validation post-completion — not tested
- Cron-based audit log pruning retention policy — not covered

**Note:** this agent's report on `lib/finance-import.ts` says "parser functions tested (parseCsv, parseXlsx, parseIif, parseOfx)" without flagging `parsePlainText`/`detectFormat` as gaps, correctly reflecting the current state after this session's test additions — this is the correct, current picture, unlike Agent 4's stale claim on the same file (see synthesis).

## 3. API Routes

23 route files under `app/api/`, table with method/purpose/auth gate for each. Pattern: all routes implement role/auth gates via `requireChurchSession()` or `requireControlPlaneSession()`; webhook routes verify provider signatures with constant-time comparison. No open endpoints identified.

## 4. App Pages

130+ page.tsx files. Two redirect-only pages identified (`app/app/page.tsx`, `app/workspace/page.tsx`), both intentional role-based routing.

**Claimed finding, since disproven:** this agent's original top-5 list included "Missing `app/app/member/page.tsx` — live 404 risk," citing 15+ references to `/app/member`. **This is incorrect** — `app/app/[role]/page.tsx` is a Next.js dynamic route segment that handles `/app/member` (and every other role) by rendering `MemberPortalHome` for `role === "member"`. No literal directory is needed for Next.js dynamic routing to work. Verified directly during synthesis: the file exists and correctly imports/renders `MemberPortalHome`. See synthesis §2 for the correction.

## 5. Seed Data

`supabase/seed.sql`: 5 auth users → 22 profiles, 8 families, 10 ministries, youth milestones, 5 events, donations, shifts, group memberships, CCM checkins. Gaps: no sample pastoral notes, consent logs, audit entries, AI interactions, or substantial import_batches history.

## 6. Top Critical Gaps (revised — see synthesis for the removed item)

1. ~~Missing `/app/member` root page~~ — **removed, disproven** (see above).
2. No audit trail validation on data erasure — `lib/compliance/data-rights-actions.ts` executes erasure but post-erasure verification (all related records deleted, audit_log captured) is untested.
3. Repeat: ARIA/loading-skeleton gap — **also disproven this round**, see synthesis; this agent did not independently verify the current file state on this specific point, Agent 3 did.
4. Finance-import **batch-commit** workflow untested (distinct from parsers, which now have coverage).
5. Webhook DLQ lacks alerting/dashboard — `communication_dlq` now exists and captures exhaustion, but nothing surfaces it to an operator proactively.
