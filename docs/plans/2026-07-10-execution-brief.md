# 2026-07-10 Execution Brief

Date: 2026-07-03
Checkpoint target: 2026-07-10 weekly go/no-go review
Source checklist: docs/plans/mvp-competitive-go-no-go-checklist.md
Phase context: Phase D (Competitive 60 days) — second gate push

## Objective

Continue Phase D gate reduction. Phase D exit: "GO if product can be evaluated
against incumbents without workaround explanations."

Four blockers identified at the 2026-07-03 checkpoint:
1. autoPostToGl is local-SQL-only — Supabase mode skips GL posting silently
2. CI only runs lint+build — 689 unit tests never gate PRs
3. Member home has no personal analytics — gap vs Church Center and ChurchTrac
4. Push notification delivery is unimplemented — push_opt_in exists but dispatches nothing

## Current scorecard (2026-07-03)

- MVP Today: `GO`
- MVP +2 weeks: `GO`
- Competitive 30 days: `GO`
- Competitive 60 days: `NO-GO` (risk-reduced) ← target: further gate reduction

## Target outcomes (2026-07-10)

- MVP Today: `GO` (hold)
- MVP +2 weeks: `GO` (hold)
- Competitive 30 days: `GO` (hold)
- Competitive 60 days: `NO-GO` (further risk-reduced — all four blockers addressed)

## Workstreams

### WS-D4: autoPostToGl Supabase Path

Status: Planned
Priority: P0 — functional gap requiring workaround explanation to evaluators

Context: `autoPostToGl()` in `app/api/webhooks/stripe/route.ts` uses
`queryTenantLocalDb()` only. The `handlePaymentIntentSucceeded` Supabase path
defers GL posting with a comment. Same for `reverseGlEntryForRefund` in
`handleChargeRefunded`. In production Supabase mode, every succeeded donation
silently skips GL auto-posting.

The Supabase admin path pattern is established in the same file
(handleChargeRefunded Supabase path). Tables involved:
`giving_fund_accounts`, `finance_journals`, `finance_journal_lines`,
`donation_gl_posts`.

Deliverables:
- `autoPostToGlSupabase(supabase, donationId, churchId, amountCents, fundDesignation)` —
  idempotency check on `donation_gl_posts`, fund mapping lookup from
  `giving_fund_accounts`, journal + lines insert, audit row insert. Best-effort:
  errors log and return, never throw.
- `reverseGlEntryForRefundSupabase(supabase, donationId, churchId)` — look up
  `donation_gl_posts` by `donation_id`, void the linked journal. Best-effort.
- Wire both into the Supabase paths of `handlePaymentIntentSucceeded` and
  `handleChargeRefunded`.
- 4 new tests in `app/api/webhooks/stripe/route.test.ts` covering: GL post on
  succeeded, GL skip when fund mapping missing, idempotency guard, GL reversal
  on refund.

Definition of done:
- Supabase-mode webhook processing posts donations to GL and voids on refund.
- Idempotent: re-delivery does not double-post.
- Targeted tests, lint, and build pass.

### WS-D5: CI Gate Automation

Status: Planned
Priority: P1 — 689 unit tests not gated in CI is a process reliability gap

Context: `.github/workflows/ci.yml` runs only `npm run check` (lint + build).
The full Vitest suite never blocks a PR. `npm run audit:rls` exists but is
manual-only. E2E tests require a live DB and cannot run in CI — they remain
manual pre-release gates per RELEASE_CHECKLIST.md.

Deliverables:
- Add `npm run test` step to the `verify` job in `ci.yml` after the `check` step.
- Add `npm run audit:rls` step with `continue-on-error: true` (advisory — skips
  gracefully when DB is unavailable in CI, same behavior the script already has).
- Update `RELEASE_CHECKLIST.md` to reflect that unit tests and RLS audit now run
  in CI automatically; distinguish CI-automated gates from manual pre-release gates.

Definition of done:
- Every PR that modifies `app/`, `lib/`, or `components/` runs the full Vitest
  suite in CI before merge.
- `audit:rls` output is visible in CI without blocking PRs when DB unavailable.
- RELEASE_CHECKLIST.md is current.

### WS-D7: Member Mobile Analytics

Status: Planned
Priority: P2 — member home lacks personal metrics vs. Church Center / ChurchTrac

Context: `components/application/member-portal-home.tsx` shows quick actions and
upcoming events but no personal metrics. `reports-dashboards.tsx` already
implements a CSS-based spark-bar pattern (TrendCard) with no external charting
dependency. Member analytics data can be added to the existing
`getMemberPortalData` parallel loader in `lib/member-portal-data.ts`.

Deliverables:
- Three new loader fields on `MemberPortalData`:
  - `givingSummary: { totalCents: number; giftCount: number } | null` — YTD
  - `attendanceTrend: Array<{ serviceDate: string }> | null` — last 8 records
  - `myGroups: Array<{ id: string; name: string; role: string }>` — active memberships
- Three new UI cards on member home (3-column SimpleGrid, graceful absent-state):
  - Giving YTD: formatted currency total + gift count
  - Attendance trend: CSS spark-bars mirroring TrendCard pattern
  - My Groups: group name list with role badge
- Dual-path loaders (Supabase + local fallback), graceful degradation when tables missing.
- Tests in `lib/member-portal-data.test.ts` for all three loader branches.

Definition of done:
- Member home surfaces personal giving, attendance, and group data.
- All three cards absent-safe (no empty-state clutter when data unavailable).
- Targeted tests, lint, and build pass.

### WS-D6: Web-Push Notification Foundation

Status: Planned
Priority: P3 — closes push delivery gap; `push_opt_in` exists but dispatches nothing

Context: `notification_preferences` has `push_opt_in`. `queue-communication.ts`
has a push dispatch stub deferred to Phase 7. `public/sw.js` handles caching
but has no push event handler. `web-push` npm package not installed. No
`push_subscriptions` table.

Deliverables:
- Migration `supabase/migrations/20260710000000_push_subscriptions.sql`:
  `push_subscriptions` table with `(id, church_id, profile_id, endpoint, p256dh,
  auth_secret, created_at)`, RLS for member own-record management and admin read.
- Install `web-push` npm package; document `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
  `VAPID_SUBJECT` env vars in `docs/setup/production-deployment.md`.
- `app/api/push/subscribe/route.ts` — POST endpoint: parse PushSubscription JSON,
  require authenticated session, upsert to `push_subscriptions`, graceful skip
  when VAPID keys missing.
- `public/sw.js` — add `push` event listener (show notification) and
  `notificationclick` listener (open URL).
- `lib/notifications/queue-communication.ts` — replace push stub with real
  `webpush.sendNotification()` dispatch for all active subscriptions; guard on
  VAPID keys configured.
- `components/application/notification-preferences-form.tsx` — add push toggle
  that requests browser permission and POSTs subscription to `/api/push/subscribe`;
  render only when `'PushManager' in window`.
- Tests for subscribe route (role gate, upsert, VAPID-missing graceful skip) and
  push dispatch path.

Definition of done:
- Members can opt into push notifications from the preferences form.
- Queued communications dispatch to push where subscribed.
- VAPID-key-absent environments gracefully degrade.
- Targeted tests, lint, and build pass.

## Sequencing

1. WS-D4 (GL posting) — code change, highest functional-gap priority
2. WS-D5 (CI gates) — config change, highest process-reliability priority
3. WS-D7 (member analytics) — feature addition, high member-experience impact
4. WS-D6 (web-push) — feature addition, requires new migration + npm package

## Risks

- WS-D4 finance_journal_lines schema: migration defines `side + amount_cents` but
  runtime code uses `debit_cents + credit_cents`. Authoritative columns must be
  confirmed from actual migration SQL before Supabase inserts are written.
- WS-D5 CI test run time: adding 689 Vitest tests to CI will increase CI duration.
  Vitest is fast (~10-15s expected); not a blocking risk.
- WS-D6 VAPID key management: keys must never be committed to source. Generation
  and env-var documentation must be explicit in production-deployment.md.

## 2026-07-10 review checklist

- Did WS-D4 ship? Does Supabase-mode webhook processing auto-post to GL?
- Did WS-D5 ship? Do unit tests block PRs in CI?
- Did WS-D7 ship? Does member home show personal analytics?
- Did WS-D6 ship? Can members subscribe to push notifications?
- Did MVP Today, +2 weeks, and 30-day gates hold at GO?
- Is Competitive 60 days further risk-reduced?
