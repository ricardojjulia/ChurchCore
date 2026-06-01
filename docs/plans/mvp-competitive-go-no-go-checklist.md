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

### Required gates

- Communications provider lifecycle at production depth with idempotent webhooks and consent-safe operations.
- Mobile member workflows are reliable and complete enough for ordinary churchgoer use.
- Migration/import supports vendor adapters across people, groups, events, attendance, and giving.
- Security proof is operationalized: role matrix + route/action evidence + smoke + dependency/secret/code scans pass in release gates.
- Buyer-facing proof package is up to date (application guide, roadmap status, and evidence-linked claims).

### Exit decision

- GO if product can be evaluated against incumbents without workaround explanations.
- NO-GO if migration confidence or operational reliability still depends on internal handholding.

## Weekly scorecard template

Use this scoring line in each factory run:

- MVP Today: `GO` / `NO-GO`
- MVP +2 weeks: `GO` / `NO-GO`
- Competitive 30 days: `GO` / `NO-GO`
- Competitive 60 days: `GO` / `NO-GO`
- Highest blocker this week:
- Evidence links:

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

### 2026-06-12 (planned checkpoint)

- Owner: Product + Engineering (weekly readiness review in planning sync)
- Execution brief: [docs/plans/2026-06-12-execution-brief.md](docs/plans/2026-06-12-execution-brief.md)
- Sequence status (2026-05-31): WS-C1 worship/setlist planning, WS-C2 Stripe refund lifecycle, WS-C3 groups import are all planned.
- MVP Today: `TARGET GO`
- MVP +2 weeks: `TARGET GO` (promote from CONDITIONAL — close Spanish soft gap if feasible)
- Competitive 30 days: `TARGET NO-GO` (risk reduction expected)
- Competitive 60 days: `TARGET NO-GO`
- Highest blocker to close by this checkpoint: service-planning depth (WS-C1).
- Expected gate changes:
  - Worship/setlist planning depth closed: ChurchAdmin can create a service plan with songs, readings, sermon metadata, and run-of-service ordering.
  - Stripe refund lifecycle closed: `refunded` and `cancelled` states reconcile via webhook and ChurchAdmin operator action.
  - Groups import available at dry-run + commit level.
