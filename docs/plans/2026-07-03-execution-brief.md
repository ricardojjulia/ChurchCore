# 2026-07-03 Execution Brief

Date: 2026-06-03
Checkpoint target: 2026-07-03 weekly go/no-go review
Source checklist: docs/plans/mvp-competitive-go-no-go-checklist.md
Phase context: Phase D (Competitive 60 days) — first gate push

## Objective

Move Competitive 60-day from NO-GO toward GO. Phase D exit: "GO if product
can be evaluated against incumbents without workaround explanations."

Key finding from Phase D research: communications webhooks Supabase path is
already fully implemented — not a code blocker. The main gaps are:
1. Production deployment is underdocumented (env vars, webhook URLs, setup checklist)
2. No buyer-facing proof package (positioning, competitive matrix, security story)
3. Security proof needs release-gate tightening (RLS audit in CI, testing schema freshness)
4. Member mobile lacks push notification delivery (email/SMS only today)

## Current scorecard (2026-06-26)

- MVP Today: `GO`
- MVP +2 weeks: `GO`
- Competitive 30 days: `GO`
- Competitive 60 days: `NO-GO` ← target: begin gate reduction

## Target outcomes (2026-07-03)

- MVP Today: `GO` (hold)
- MVP +2 weeks: `GO` (hold)
- Competitive 30 days: `GO` (hold)
- Competitive 60 days: `NO-GO` (risk-reduced — docs, security, production readiness closed)

## Workstreams

### WS-D1: Production Deployment Readiness

Status: Planned
Priority: P0 — evaluators cannot deploy without this

Context: Communications webhook Supabase path is implemented but env vars,
webhook URLs, and the production deployment checklist are not documented
well enough for an evaluator to stand up a production instance without
asking the team. The Stripe refund webhook (`charge.refunded`) still has a
`shouldUseLocalTenantFallback()` guard that makes it a no-op in Supabase mode.

Deliverables:
- `docs/setup/production-deployment.md` — step-by-step checklist:
  required env vars (all categories), Vercel deploy settings, Supabase
  project setup, Stripe webhook registration (including `charge.refunded`
  event), Resend/Twilio webhook registration, CRON_SECRET setup, local
  Supabase vs. production toggle, health check commands.
- Fix `app/api/webhooks/stripe/route.ts` `handleChargeRefunded` to add a
  Supabase client path (mirror the existing Stripe payment_intent handlers
  that already have dual-path support).
- Update `docs/runbooks/communications.md` with production webhook URLs and
  signature verification notes.

Definition of done:
- An evaluator can follow `docs/setup/production-deployment.md` end-to-end
  and deploy ChurchCore to Vercel + Supabase without asking the team.
- `handleChargeRefunded` processes refunds in both local and Supabase modes.
- Targeted tests for the Supabase refund path, lint, and build pass.

### WS-D2: Buyer-Facing Proof Package

Status: Planned
Priority: P1 — evaluators need positioning materials to evaluate against incumbents

Context: `docs/application-guide.md` is a thorough internal/operator guide
but is not structured for an evaluator who wants to know: "How does ChurchCore
compare to Planning Center and why should my church switch?"

Deliverables:
- `docs/buyer/competitive-overview.md` — 2-page positioning doc:
  compliance-first value prop, side-by-side feature matrix (ChurchCore vs.
  Planning Center, Breeze/Tithely, ChurchTrac), differentiators (finance+GL,
  child safety compliance, audit posture), target segment description,
  honest "not yet competitive" callouts.
- `docs/buyer/security-privacy-story.md` — security value doc for
  administrators and board members: tenant isolation architecture, child
  safety data controls, audit trail evidence, GDPR/data rights, role access
  model — written in church-office language, not engineering language.
- Update `README.md` Phase D release section to reflect Phase C GO and
  current capability summary.

Definition of done:
- A pastor or administrator can read both docs and understand the value prop
  and security posture without reading source code.
- No claims are made that are not backed by implemented, tested features.

### WS-D3: Security Proof Operationalization

Status: Planned
Priority: P2 — required for Phase D security gate

Context: Security matrix is current (2026-05-29). CI has gitleaks +
dependency-review. Missing: RLS audit in CI pipeline (the `audit:rls` npm
script exists but is not run in CI), testing schema freshness relative to
new Phase C features, and formal release checklist that gates any merge to
main on all security evidence passing.

Deliverables:
- Add `npm run audit:rls` to CI workflow (`.github/workflows/ci.yml` or
  equivalent) as an advisory step — fails the pipeline if RLS is missing on
  any church_id table. Uses the existing script from migration tooling.
- Refresh `docs/security-role-access-matrix.md` to include Phase C new
  surfaces: attendance import, giving import, events import, groups import,
  communications retry action.
- Refresh `docs/testing-schema.md` to document Phase C test coverage additions.
- Add a formal `RELEASE_CHECKLIST.md` that codifies what must pass before any
  release: lint, build, smoke, e2e readiness, e2e onboarding, unit tests,
  audit:rls, secret scan.

Definition of done:
- `RELEASE_CHECKLIST.md` exists with the complete gates.
- Security matrix covers all Phase C surfaces.
- `npm run audit:rls` runs in CI.
- Testing schema is current.

## Sequencing

1. WS-D1 (production deployment) — code + docs, highest evaluator-blocking priority
2. WS-D2 (buyer package) — docs only, highest competitive-positioning priority
3. WS-D3 (security operationalization) — CI + docs, required for Phase D gate

## Risks

- WS-D1 Stripe refund Supabase path: multi-tenant routing via Supabase
  requires careful church_id resolution. The existing `payment_intent.succeeded`
  Supabase path in the same file is the reference — mirror it exactly.
- WS-D2 competitive claims: must not overclaim. All claims must map to
  implemented, tested features. Review against go/no-go checklist before publish.
- WS-D3 RLS audit in CI: `audit:rls` requires a live Supabase connection.
  Must configure the audit step to skip gracefully (exit 0) when the Supabase
  URL is not available in CI — same graceful-skip pattern already in the script.

## 2026-07-03 review checklist

- Did WS-D1 ship? Can an evaluator deploy without team assistance?
- Did WS-D2 ship? Does a buyer-facing positioning doc exist?
- Did WS-D3 ship? Is the release checklist codified and the matrix current?
- Did MVP Today and MVP +2 weeks hold at GO?
- Is Competitive 60 days risk-reduced?
