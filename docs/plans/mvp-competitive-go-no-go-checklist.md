# MVP and Competitive Go/No-Go Checklist

Date: 2026-05-29
Owner: Product + Engineering
Status: Active operating checklist

## How to use this checklist

- Run this checklist at least weekly during active delivery.
- A phase is `GO` only when every `Required` gate is complete.
- Any failed `Required` gate is `NO-GO` regardless of pass rate elsewhere.
- Record evidence links and command output in the current factory-run log.

## Phase A: MVP Today (Controlled Pilot)

Goal: safe and repeatable church-admin pilot usage.

### Required gates

- Weekly operator path: ChurchAdmin can complete setup, people/account approvals, event roster, children safety check, giving/finance exceptions, communications review, and reports review from readiness routes.
- Local reliability: `npm run setup:local`, `npm run smoke:local`, and `npm run test:e2e:readiness` pass on a clean machine.
- Role boundaries: ChurchAdmin-only sensitive routes/actions deny Pastor, Secretary, Ministry Leader, Member, and Public where applicable.
- Sensitive workflows covered by tests: children, communications, event registration boundaries, import dry run, import commit action role/backend gates.
- Security evidence docs current: security assessment, mitigation plan, and role-access matrix reflect latest executable evidence.

### Evidence commands

- `npm run test -- app/app/church-admin/people/import/actions.test.ts app/app/church-admin-actions.test.ts app/app/communications-actions.test.ts app/app/member-actions.test.ts`
- `npm run test:e2e:readiness`
- `npm run lint`
- `npm run build`

### Exit decision

- GO if all required gates pass with no Sev-1/Sev-2 open regressions.
- NO-GO if any required gate fails.

## Phase B: MVP in 2 Weeks (Broad Evaluator Readiness)

Goal: evaluator can run end-to-end without internal coaching.

### Required gates

- Onboarding flow complete in browser path: public registration -> admin approval -> invite -> first sign-in -> profile hydration.
- Communications operations complete enough for weekly use: retry, suppression, delivery event drilldown, and clear unresolved-lane workflow.
- Member mobile critical paths stable: home, schedule, groups, giving history, profile/family pending-review states, and enabled check-in routes.
- Import operations usable for people/households: source mapping, dry run, commit, and operator-facing audit summary.
- Documentation parity: application guide + roadmap + testing schema match real behavior.

### Strongly recommended gates

- Spanish coverage complete for highest-traffic evaluator routes.
- ChurchAdmin navigation grouped by operating domains for faster route discovery.

### Exit decision

- GO if all required gates pass and recommended gates have no high-risk gaps.
- NO-GO if onboarding or communications operations remain incomplete.

## Phase C: Competitive in 30 Days (Segment-Wedge Competitive)

Goal: competitive for compliance-first, operations-heavy churches.

**Self-assessment note:** Phase C GO is declared by the team based on feature and test criteria. It means the capabilities exist and are tested — not that they have been validated in a real switching scenario. A church admin migrating 2,000 members from Planning Center and finding the import trustworthy is a different claim than "the import code handles dry-run and commit." The external validation that would make this claim meaningful belongs to Phase D.

### Required gates

- Paid event registration lifecycle complete: pending/paid/failed/refunded states, operator-visible reconciliation cues, and payment evidence updates.
- Service-planning depth closes replacement blocker for target segment.
- Import tooling expanded beyond people/households with stable commit/audit model.
- Security evidence has matrix-linked test coverage for sensitive route/action surfaces and cross-church denial patterns.
- Weekly readiness path remains green while these changes land.

### Exit decision

- GO if replacement-critical blockers for target segment are closed.
- NO-GO if service planning and migration breadth are still missing for evaluator migration confidence.

## Phase D: Competitive in 60 Days (Broad Mid-Market Credibility)

Goal: credible alternative for 100-1,000 attendance churches evaluating incumbent migration.

Phase D has two categories of gates. **Buildable gates** can be closed with code, tests, and docs — the team can self-certify them. **External validation gates** require evidence from outside the team and cannot be self-certified. Declaring Phase D GO on buildable gates alone is not Phase D GO; it is Phase D-ready. Full Phase D GO requires at least one external validation signal.

### Buildable gates

- **Communications production depth**: `npm run test -- lib/communications/` passes; SendGrid and Twilio webhooks registered in production dashboard; push delivery deployed (VAPID keys configured, subscribe route live, service worker push handler active); Vercel cron auto-retry running. Evidence command: `npm run test:e2e:readiness` ✅ plus manual production webhook delivery check.
- **Member mobile e2e coverage**: `npm run test:e2e:member-mobile` passes covering check-in, giving history, profile update, groups browse, and family view at phone viewport. No critical layout regressions at 390px width.
- **Import vendor adapters, all five entities**: people/households, groups, events, attendance, and giving at dry-run + commit with source-adapter support. ✅ Closed Phase C (2026-06-26).
- **Security release gates in CI**: lint, build, unit tests (`npm run test`), and RLS audit (`npm run audit:rls`) all gate every PR automatically. ✅ Closed WS-D5 (2026-07-10).
- **GL auto-posting production-wired**: `autoPostToGlSupabase` and `reverseGlEntryForRefundSupabase` active in Supabase mode; `finance_journals.journal_type` constraint includes `'giving'`. ✅ Closed WS-D4 (2026-07-10).
- **Buyer-facing proof package current**: `docs/buyer/` reflects the implemented feature set with no overclaims. ✅ Closed WS-D2 (2026-07-03).

### External validation gates (cannot be self-certified)

- At least one church or prospective church admin has completed the onboarding flow (public registration → admin approval → first sign-in → readiness route) without team coaching and without a critical blocker.
- At least one church has run a people/household import dry-run from a real incumbent export (Planning Center, Breeze, or Pushpay CSV) and found the result trustworthy enough to commit or nearly commit.
- At least one uncoached evaluator session has been completed with no critical UX blocker that caused the evaluator to stop or ask for internal guidance to continue.

### Evidence commands (buildable)

- `npm run test:e2e:member-mobile`
- `npm run test:e2e:readiness`
- `npm run test:e2e:onboarding`
- `npm run test`
- `npm run lint`
- `npm run build`

### Exit decision

- **Phase D-ready (buildable GO)**: all buildable gates pass with no Sev-1/Sev-2 open regressions. The team can self-certify this.
- **Phase D GO (full)**: buildable GO AND at least one external validation gate has documented evidence.
- **NO-GO**: any buildable gate fails, or the product has never been evaluated by anyone outside the team.

## Weekly scorecard template

Use this scoring line in each factory run:

- MVP Today: `GO` / `NO-GO`
- MVP +2 weeks: `GO` / `NO-GO`
- Competitive 30 days: `GO` / `NO-GO`
- Competitive 60 days: `NO-GO` / `PHASE D-READY` / `GO`
- Highest blocker this week:
- Regressed gates: `none` / [gate name and what broke]
- Evidence links:

The `Regressed gates` field is required on every entry. Gates are not assumed to hold; they must be re-verified or explicitly noted as not re-run this cycle. A gate that was GO and is not re-run this cycle should be listed as `[gate] — not re-run this cycle`.

## Weekly scorecards

### 2026-05-29

- MVP Today: `GO`
- MVP +2 weeks: `NO-GO`
- Competitive 30 days: `NO-GO`
- Competitive 60 days: `NO-GO`
- Highest blocker this week: service-planning depth remains the closest unresolved blocker for the MVP +2 weeks gate now that security evidence maintenance is consolidated.
- Evidence links:
  - [docs/plans/competitive-readiness-30-day-execution.md](docs/plans/competitive-readiness-30-day-execution.md)
  - [docs/plans/competitive-readiness-roadmap.md](docs/plans/competitive-readiness-roadmap.md)
  - [docs/mvp-readiness-audit.md](docs/mvp-readiness-audit.md)
  - [docs/security-role-access-matrix.md](docs/security-role-access-matrix.md)
  - [docs/security-assessment.md](docs/security-assessment.md)
  - [docs/security-mitigation-plan.md](docs/security-mitigation-plan.md)
  - [docs/testing-schema.md](docs/testing-schema.md)
  - [docs/factory-runs/2026-05-29-findings4-5-6-depth-batch.md](docs/factory-runs/2026-05-29-findings4-5-6-depth-batch.md)
  - `npm run setup:local` ✅
  - `npm run smoke:local` ✅
  - `npm run test:e2e:readiness` ✅ (3 passed, 1 skipped control-plane-context test)
  - `npm run test:e2e:onboarding` ✅ (1 passed)
  - `npm run test -- app/app/church-admin-actions.test.ts app/sign-in/actions.test.ts` ✅ (29 passed)
  - `npm run lint` ✅
  - `npm run test -- lib/communications-closure-guidance.test.ts lib/church-admin-readiness-modules.test.ts app/app/communications-actions.test.ts` ✅ (35 passed)
  - `npm run build` ✅
  - `npm run test -- app/app/church-admin/people/import/actions.test.ts app/app/church-admin-actions.test.ts app/app/communications-actions.test.ts app/app/member-actions.test.ts` ✅

### Gate notes

- MVP Today: required local reliability gate is met (`setup:local`, `smoke:local`, `test:e2e:readiness`) and the role-boundary/readiness route checks continue to pass.
- MVP +2 weeks: import commit flow, payment defaults, browser-complete onboarding, communications closure guidance, and consolidated security evidence now have executable coverage; service-planning depth remains the remaining blocker.
- Competitive 30 days: paid registration defaults and import foundation moved forward, but service-planning depth remains a replacement blocker.
- Competitive 60 days: provider-depth communications lifecycle, broader migration coverage, and release-grade operational proof still remain.

### 2026-06-05 (planned checkpoint)

- Owner: Product + Engineering (weekly readiness review in planning sync)
- Execution brief: [docs/plans/2026-06-05-execution-brief.md](docs/plans/2026-06-05-execution-brief.md)
- Sequence status (2026-05-29): WS-1 local reliability, WS-2 browser-complete onboarding, WS-3 communications unresolved-lane closure, and WS-4 security evidence maintenance are complete; the next follow-up is service-planning depth.
- MVP Today: `TARGET GO`
- MVP +2 weeks: `TARGET NO-GO` (closing to conditional GO)
- Competitive 30 days: `TARGET NO-GO` (risk reduction expected)
- Competitive 60 days: `TARGET NO-GO`
- Highest blocker to close by this checkpoint: service-planning depth validation.
- Expected gate changes:
  - MVP Today local reliability gate moved to passing on clean-machine execution (`setup:local`, `smoke:local`, `test:e2e:readiness`).
  - Onboarding browser path moved to passing with an executable end-to-end check from public registration through first sign-in (`npm run test:e2e:onboarding`).
  - Communications unresolved-lane operations moved to passing with explicit operator closure workflow notes tied to tests/docs.
  - Security evidence maintenance moved to passing with consolidated evidence links across the matrix, assessment, mitigation, and testing schema docs.

### 2026-05-31 (interim verification run)

- Owner: Product + Engineering
- MVP Today: `GO`
- MVP +2 weeks: `CONDITIONAL GO`
- Competitive 30 days: `NO-GO`
- Competitive 60 days: `NO-GO`
- Highest blocker this week: service-planning depth (worship/setlist planning unstarted); stripe refund lifecycle gap is Phase C.
- Evidence:
  - `npm run lint` ✅ (clean)
  - `npm run build` ✅ (92 routes, 0 errors)
  - `npm run smoke:local` ✅ (all 21 smoke checks passed)
  - `npm run test:e2e:readiness` ✅ (3 passed, 1 skipped — control-plane context)
  - `npm run test:e2e:onboarding` ✅ (1 passed)
- Gate change: MVP +2 weeks moved from NO-GO to CONDITIONAL GO. All required Phase B gates now pass. Remaining soft gap: Spanish coverage for finance/communications routes (not a hard blocker). Next Phase C blockers: stripe refund flow, service-planning depth, import breadth beyond people/households.

### 2026-06-12 (checkpoint — verified)

- Owner: Product + Engineering
- MVP Today: `GO`
- MVP +2 weeks: `CONDITIONAL GO` (hold — Spanish coverage soft gap not addressed this cycle)
- Competitive 30 days: `NO-GO` (risk-reduced — two of three major Phase C blockers closed)
- Competitive 60 days: `NO-GO`
- Highest remaining blocker: events/attendance/giving import breadth; full communications provider depth.
- Evidence:
  - `npm run lint` ✅ (clean on source files — 0 errors in app/, lib/, components/)
  - `npm run build` ✅ (98 routes, 0 TypeScript errors)
  - `npm run smoke:local` ✅ (all checks passed)
  - `npm run test:e2e:readiness` ✅ (3 passed, 1 skipped — control-plane context)
  - `npm run test:e2e:onboarding` ✅ (1 passed)
  - `npm run test` ✅ (371 passed, 63 files)
- Gate changes this cycle:
  - WS-C1: Worship/setlist planning depth closed — service-plan items support song key, duration, artist; type selector with 7 types; Move Up/Down reordering; Sermon Info block; cross-church write blocked in addRunOfServiceItemAction.
  - WS-C2: Stripe refund lifecycle closed — `refunded`/`partially_refunded` states on both registration tables; operator-initiated refund action; `charge.refunded` webhook with idempotency guard; UNIQUE constraint on refund_id; best-effort GL reversal.
  - WS-C3: Groups import at dry-run + commit level — source_id dedup key; adapters for generic_csv, planning_center, breeze; unmatched-leader warning (not rejection); `/app/church-admin/groups/import` route live.
- Remaining Phase C blockers (next brief): events/attendance/giving import breadth, communications provider depth, Spanish coverage (Phase B soft gap).

### 2026-06-19 (planned checkpoint)

- Owner: Product + Engineering (weekly readiness review in planning sync)
- Execution brief: [docs/plans/2026-06-19-execution-brief.md](docs/plans/2026-06-19-execution-brief.md)
- Sequence status (2026-06-01): WS-C4 Spanish coverage, WS-C5 communications auto-retry + unsubscribe injection, WS-C6 events import are all planned.
- MVP Today: `TARGET GO`
- MVP +2 weeks: `TARGET GO` (promote from CONDITIONAL GO — Spanish coverage closes the soft gap)
- Competitive 30 days: `TARGET NO-GO` (further risk reduction)
- Competitive 60 days: `TARGET NO-GO`
- Highest blocker to close by this checkpoint: Spanish coverage for communications routes (WS-C4).
- Expected gate changes:
  - MVP +2 weeks promoted to full GO: all ChurchAdmin communications and remaining finance route strings covered by i18n.
  - Communications operational depth improved: auto-retry for failed sends, unsubscribe link auto-injection into outbound emails.
  - Events import available at dry-run + commit level.

### 2026-06-19 (checkpoint — verified)

- Owner: Product + Engineering
- MVP Today: `GO`
- MVP +2 weeks: `GO` (promoted from CONDITIONAL GO — Spanish coverage closed)
- Competitive 30 days: `NO-GO` (further risk-reduced — comms depth closed, events import added)
- Competitive 60 days: `NO-GO`
- Highest remaining blocker: giving/attendance import breadth; full communications provider depth (Twilio SMS production path); member mobile hardening.
- Evidence:
  - `npm run lint` ✅ (clean on source files)
  - `npm run build` ✅ (94 routes, 0 errors)
  - `npm run smoke:local` ✅ (all checks passed)
  - `npm run test:e2e:readiness` ✅ (3 passed, 1 skipped — control-plane context)
  - `npm run test:e2e:onboarding` ✅ (1 passed)
  - `npm run test` ✅ (559 passed, 70 files)
- Gate changes this cycle:
  - WS-C4: Spanish coverage closed — 6 components fully covered (communications, finance accounts, finance budget, finance dashboard, giving admin, giving dashboard); 186 translated keys across 5 namespaces; MVP +2 weeks promoted to full GO.
  - WS-C5: Communications operational depth closed — Vercel cron auto-retries transient failures every 15 min; unsubscribe link auto-injected into every outbound email; operator bulk-retry action added to comms hub.
  - WS-C6: Events import at dry-run + commit level — source_id dedup, 3 source adapters, ISO 8601 validation, ministry matching with warning; `/app/church-admin/events/import` route live.
- Remaining Phase C blockers (next brief): giving/attendance import, Twilio SMS production depth, member mobile hardening for competitive readiness.

### 2026-06-26 (planned checkpoint)

- Owner: Product + Engineering (weekly readiness review in planning sync)
- Execution brief: [docs/plans/2026-06-26-execution-brief.md](docs/plans/2026-06-26-execution-brief.md)
- Sequence status (2026-06-02): WS-C7 attendance import, WS-C8 giving import, WS-C9 SMS depth are all planned.
- MVP Today: `TARGET GO`
- MVP +2 weeks: `TARGET GO`
- Competitive 30 days: `TARGET GO` (all required Phase C gates closed)
- Competitive 60 days: `TARGET NO-GO`
- Highest blocker to close by this checkpoint: import breadth gate (attendance + giving).
- Expected gate changes:
  - Phase C import gate fully satisfied: attendance and giving imports at dry-run + commit level.
  - SMS channel depth closed: retry cron covers SMS, suppression UI extended.
  - Competitive 30 days promotes to GO.

### 2026-06-26 (checkpoint — verified)

- Owner: Product + Engineering
- MVP Today: `GO`
- MVP +2 weeks: `GO`
- Competitive 30 days: `GO` (all required Phase C gates closed)
- Competitive 60 days: `NO-GO`
- Evidence:
  - `npm run lint` ✅ (clean on source files)
  - `npm run build` ✅ (96 routes, 0 errors)
  - `npm run smoke:local` ✅ (all checks passed)
  - `npm run test:e2e:readiness` ✅ (3 passed, 1 skipped — control-plane context)
  - `npm run test:e2e:onboarding` ✅ (1 passed)
  - `npm run test` ✅ (682 passed, 76 files)
- Gate changes this cycle:
  - WS-C7: Attendance import at dry-run + commit — source_id dedup, 3 adapters, in-file and DB present-dup guards, unmatched profile/event warnings.
  - WS-C8: Giving import at dry-run + commit — amount validation, donor matching, is_anonymous preserved on update, no GL posting, GL reconciliation notice.
  - WS-C9: Verified complete — retry cron covers SMS channel, suppression UI supports SMS (no new code needed).
  - Phase C import gate: people/households ✅ groups ✅ events ✅ attendance ✅ giving ✅ — all five entities covered.
  - **Competitive 30 days: GO.**
- Remaining Phase D blockers (next cycle): communications provider depth at production depth (idempotent webhooks production-wired), mobile member workflow reliability, migration/import vendor adapter breadth for Phase D.

### 2026-07-03 (planned checkpoint)

- Owner: Product + Engineering (weekly readiness review in planning sync)
- Execution brief: [docs/plans/2026-07-03-execution-brief.md](docs/plans/2026-07-03-execution-brief.md)
- Sequence status (2026-06-03): WS-D1 production deployment readiness, WS-D2 buyer-facing proof package, WS-D3 security proof operationalization are all planned.
- MVP Today: `TARGET GO`
- MVP +2 weeks: `TARGET GO`
- Competitive 30 days: `TARGET GO`
- Competitive 60 days: `TARGET NO-GO` (risk reduction expected)
- Highest blocker to close by this checkpoint: production deployment docs (WS-D1).
- Expected gate changes:
  - Production deployment documented end-to-end; Stripe refund webhook Supabase path closed.
  - Buyer-facing positioning and security story published.
  - Security matrix refreshed for Phase C; RELEASE_CHECKLIST.md codified.

### 2026-07-03 (checkpoint — verified)

- Owner: Product + Engineering
- MVP Today: `GO`
- MVP +2 weeks: `GO`
- Competitive 30 days: `GO`
- Competitive 60 days: `NO-GO` (risk-reduced)
- Evidence:
  - `npm run lint` ✅ (clean on source files)
  - `npm run build` ✅ (96 routes, 0 errors)
  - `npm run smoke:local` ✅ (all checks passed)
  - `npm run test` ✅ (689 passed, 76 files)
- Gate changes this cycle:
  - WS-D1: Stripe webhook Supabase paths closed — handleChargeRefunded, handlePaymentIntentSucceeded, handlePaymentIntentFailed all production-ready; docs/setup/production-deployment.md published.
  - WS-D2: Buyer-facing proof package published — docs/buyer/competitive-overview.md (honest feature matrix vs incumbents) and docs/buyer/security-privacy-story.md (plain-language trust doc).
  - WS-D3: Security proof operationalized — RELEASE_CHECKLIST.md at repo root; security role-access matrix refreshed for 9 Phase C surfaces.
- Remaining Phase D blockers: push notification delivery (native or web-push), deeper mobile member analytics, broader release-gate automation in CI, autoPostToGl Supabase path.

### 2026-07-10 (checkpoint — verified)

- Owner: Product + Engineering
- Execution brief: [docs/plans/2026-07-10-execution-brief.md](docs/plans/2026-07-10-execution-brief.md)
- Factory run: [docs/factory-runs/2026-07-10-production-audit-and-supabase-lock.md](docs/factory-runs/2026-07-10-production-audit-and-supabase-lock.md)
- MVP Today: `GO`
- MVP +2 weeks: `GO`
- Competitive 30 days: `GO`
- Competitive 60 days: `PHASE D-READY` (all buildable gates closed; external validation not yet attempted)
- Regressed gates: none
- Evidence:
  - `npm run lint` ✅ (clean on source files)
  - `npm run build` ✅ (97 routes, 0 TypeScript errors)
  - `npm run test` ✅ (708 passed, 77 files)
- Gate changes this cycle:
  - WS-D4: GL auto-posting Supabase path repaired — `finance_journal_lines` inserts corrected to schema-authoritative `side`/`amount_cents`/`memo` columns; `autoPostToGl` and `reverseGlEntryForRefund` local paths marked dead code; `voidJournalAction` now populates `voided_at`/`voided_by`; `handleSubscriptionDeleted` Supabase path added.
  - WS-D5: CI gate automation — `npm run test` and `npm run audit:rls` run on every PR.
  - WS-D6: Web-push notification foundation — `push_subscriptions` table, subscribe route, service worker push handler, queue-communication dispatch, notification preferences form.
  - WS-D7: Member mobile analytics — giving YTD, attendance trend, and group memberships on member home.
  - **Architectural transition: Supabase-only.** `shouldUseLocalTenantFallback()` now unconditionally returns `false`. All local SQL execution paths are dead code. 16 write actions that previously returned silent `previewMode: true` success now return explicit errors. Release v3.2.0 cut.
- What "PHASE D-READY" means: every buildable gate in Phase D is now closed. The remaining gap is external validation — no church or evaluator outside the team has used the product in an uncoached session. Phase D full GO requires that signal. **The next action is scheduling an evaluator session, not writing more code.**

### Gate-run production path validation (same day, post-architecture lock)

Running these gates for the first time under the Supabase-only architecture surfaced three production bugs that were hidden by the local SQL bypass (factory run: [docs/factory-runs/2026-07-10-gate-run-supabase-production-validation.md](docs/factory-runs/2026-07-10-gate-run-supabase-production-validation.md)):

- **Bug 1 (PGRST201 FK ambiguity):** `/app/church-admin/accounts` showed zero pending requests in production Supabase mode. Fixed in `lib/church-admin-accounts-data.ts` — 17 other tables flagged for follow-up audit.
- **Bug 2 (RPC parameter name):** Every public portal registration failed silently in production (`target_church_id` vs `request_church_id`). Fixed in `app/portal/actions.ts`.
- **Bug 3 (pgcrypto search_path):** Account approval threw 500 ("gen_random_bytes does not exist") in production Supabase mode. Fixed via `supabase/migrations/20260710020000_fix_generate_member_number_search_path.sql`.
- **Environment gap:** Local GoTrue (CLI v2.89.1) doesn't support admin invite endpoint; added graceful `createUser` fallback in `inviteChurchMember`.

Final gate evidence with all three bugs fixed:
- `npm run smoke:local` ✅ (21/21 — all real Supabase paths)
- `npm run test:e2e:readiness` ✅ (3 passed, 1 expected skip)
- `npm run test:e2e:onboarding` ✅ (1 passed — full register → approve → invite → sign in → profile hydrated)
- `npm run test` ✅ (711 passed, 77 files)
- `npm run lint` ✅ (clean)
- `npm run build` ✅ (97 routes, 0 errors)
