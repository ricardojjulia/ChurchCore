# Factory Run: Production Audit and Supabase Architecture Lock

Date: 2026-07-10
Type: Production audit + architectural transition + release cut
Release: v3.2.0
Scope: lib/supabase/tenant.ts, app/api/webhooks/stripe/route.ts, lib/stripe/event-registrations.ts, app/app/finance-actions.ts, six server-action files, test updates

---

## Intent

This run captured the findings of an honest production readiness assessment, repaired the broken production Supabase paths discovered during that audit, committed an architectural decision (Supabase-only), and cut the v3.2.0 release marking the end of the Phase C/D competitive-readiness execution cycle.

---

## Audit Trigger

An end-of-cycle assessment surfaced a pattern: 542+ call sites for `shouldUseLocalTenantFallback()` had created a two-mode architecture where local SQL paths and Supabase paths were written semi-independently. The audit found that critical Supabase production paths were silently failing:

**Critical finding — GL column name divergence:**
`autoPostToGl` in `app/api/webhooks/stripe/route.ts` inserted `finance_journal_lines` rows using columns `debit_cents`, `credit_cents`, and `description` — none of which exist in the schema (migration 20260417). The authoritative columns are `side` ('debit'|'credit'), `amount_cents`, `memo`, `church_id`, `sort_order`. The same wrong assumptions existed in `reverseGlEntryForRefund` in `lib/stripe/event-registrations.ts`. Every webhook-triggered GL auto-post had been silently failing via swallowed try/catch since the feature was written.

**Critical finding — GL journal_type constraint:**
`autoPostToGl` also inserted `journal_type = 'giving'` which was not in the check constraint (`'general'|'bank_feed'|'accounts_payable'|'import'`). Fixed by migration `20260710010000_ws_d4_finance_journals_giving_type.sql`.

**Important finding — handleSubscriptionDeleted Supabase path missing:**
`handleSubscriptionDeleted` had `if (!shouldUseLocalTenantFallback()) return` — with the lock in place, subscription cancellations would never update donation status in Supabase mode.

**Important finding — silent previewMode no-ops in 16 write actions:**
Write actions across 6 files returned `{ ok: true, previewMode: true }` when backend was unavailable. Evaluators clicking buttons would see success toasts with nothing written.

**Root cause:** Dual-path architecture where local and Supabase paths were written at different times, with schema assumptions copied from the local path that had since diverged from the migration-authoritative schema.

---

## Architectural Decision

**ChurchCore is Supabase-only going forward. No new local SQL paths.**

`shouldUseLocalTenantFallback()` in `lib/supabase/tenant.ts` now unconditionally returns `false`. All existing `queryTenantLocalDb` branches are dead code — they can be removed in a future cleanup PR but must not be extended or referenced in new work.

Local development runs against a local Supabase instance. The direct Postgres pool (`queryTenantLocalDb`) is retired from all data paths.

---

## Fixes Applied

| Fix | File | Change |
|---|---|---|
| GL column names corrected | `app/api/webhooks/stripe/route.ts` | `autoPostToGlSupabase` now uses `side`, `amount_cents`, `memo`, `church_id`, `sort_order` |
| `autoPostToGl` local path | `app/api/webhooks/stripe/route.ts` | Replaced with dead-code stub |
| `reverseGlEntryForRefund` | `lib/stripe/event-registrations.ts` | Replaced with dead-code stub and schema documentation |
| `voidJournalAction` audit columns | `app/app/finance-actions.ts` | Now sets `voided_at` and `voided_by` on both local and Supabase paths |
| `handleSubscriptionDeleted` Supabase path | `app/api/webhooks/stripe/route.ts` | Full Supabase path added |
| 16 previewMode silent no-ops | 6 action files | `{ ok: false, error: "Backend not configured." }` |
| Architecture lock | `lib/supabase/tenant.ts` | `shouldUseLocalTenantFallback()` returns `false` unconditionally |

---

## Verification

```
npm run test        — 708 passed, 77 files
npm run lint        — clean (0 errors on source files)
npm run build       — 97 routes, 0 TypeScript errors
```

---

## Residual Risk

- The 542 existing `shouldUseLocalTenantFallback()` branch bodies are dead code but still present. They do not execute (the function always returns false) but they add noise. A follow-on cleanup PR should remove them and the `queryTenantLocalDb` import where it becomes unused.
- The `inviteChurchMember` helper still returns `{ previewMode: true, invited: false }` when admin auth is not configured. This is semantically correct (approval runs but invite is skipped) but the `previewMode` naming is confusing. Rename in a future cleanup.
- The `finance_journal_lines` schema uses `side` + `amount_cents`. Any custom SQL outside this codebase (direct DB queries, migrations, seeds) that assumed `debit_cents`/`credit_cents` must be updated.

---

## Release

v3.2.0 tagged after this run. See `CHANGELOG.md` for full feature summary.
