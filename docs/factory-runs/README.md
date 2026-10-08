# Factory Run Tracker

This directory records meaningful software-factory runs for ChurchCore.

Each run file should be committed with the change it describes. The goal is to make the AI-assisted development trail inspectable without relying on chat history.

## Required Run Record Sections

- **Intent:** what problem the run addressed.
- **Factory workflow:** which Claude Code or Codex workflow was used.
- **Story and acceptance criteria:** the behavior the run was meant to satisfy.
- **Technical brief:** architecture, data, tenant boundary, RBAC, sensitive-data, and documentation impact.
- **Implementation summary:** files changed and patterns reused.
- **Verification:** exact commands and pass/fail results.
- **Residual risk:** known gaps, pre-existing failures, or follow-up work.
- **Delivery:** branch, pull request, merge method, and final commit or merge hash.

## Runs

| Date | Run | Scope | Delivery |
| --- | --- | --- | --- |
| 2026-06-11 | [Demo feedback hardening](2026-06-11-demo-feedback-hardening.md) | Make demo feedback identity, fingerprints, duration, and rate limiting server-authoritative; add a cross-codebase replication prompt | Pending |
| 2026-05-25 | [Readiness module-owned builders](2026-05-25-readiness-module-builders.md) | Split setup, accounts, and people readiness into module builders | `043db58` |
| 2026-05-25 | [Enforce PR delivery workflow](2026-05-25-enforce-pr-delivery-workflow.md) | Enable admin branch-protection enforcement and document branch/PR delivery | PR #11, squash merge `7538a86` |
| 2026-05-25 | [Readiness events and volunteers](2026-05-25-readiness-events-volunteers.md) | Split weekend event and volunteer readiness into module builders | PR #12, squash merge `eed10c8` |
| 2026-05-25 | [Readiness children's ministry](2026-05-25-readiness-children-ministry.md) | Split children's ministry readiness into a module builder | PR #14, squash merge `604a703` |
| 2026-05-26 | [Release version 3.0.0](2026-05-26-release-version-3-0-0.md) | Recalculate the accumulated release as a SemVer major baseline | PR #16, squash merge `3d23855` |
| 2026-05-26 | [Readiness giving and finance](2026-05-26-readiness-giving-finance.md) | Split giving and finance readiness into a module builder | PR #18, squash merge `ff57b0c` |
| 2026-05-26 | [Readiness suggested workflows](2026-05-26-readiness-suggested-workflows.md) | Split suggested workflow readiness into a module builder | PR #20, squash merge `307263c` |
| 2026-05-26 | [Readiness communications](2026-05-26-readiness-communications.md) | Add communications readiness to the weekly operator path | PR #22, squash merge `d1376cc` |
| 2026-05-26 | [Readiness reports](2026-05-26-readiness-reports.md) | Add reports readiness to the weekly operator path | PR #25, squash merge `c231ca7` |
| 2026-05-26 | [Readiness route smoke](2026-05-26-readiness-route-smoke.md) | Expand local smoke coverage across weekly readiness targets | PR #27, squash merge `d54ab85` |
| 2026-05-26 | [Readiness Playwright smoke](2026-05-26-readiness-playwright-smoke.md) | Add browser-level coverage across weekly readiness targets | PR #29, squash merge `4608bf8` |
| 2026-05-26 | [Readiness denied-role Playwright](2026-05-26-readiness-denied-role-playwright.md) | Add tenant denied-role browser coverage for ChurchAdmin-only readiness targets | PR #31, squash merge `e4b363a` |
| 2026-05-26 | [Readiness target states](2026-05-26-readiness-target-states.md) | Add shared target-state UI and first readiness target route slice | PR #33, squash merge `b311d2a` |
| 2026-05-26 | [Readiness target states operations](2026-05-26-readiness-target-states-operations.md) | Roll target-state UI into accounts, events, volunteers, and workflows | PR #35, squash merge `668289a` |
| 2026-05-27 | [Readiness target states sensitive ops](2026-05-27-readiness-target-states-sensitive-ops.md) | Roll target-state UI into children, finance journals, communications, and reports | PR #38, merge commit `d4e104b` |
| 2026-05-27 | [Readiness resolution actions audit](2026-05-27-readiness-resolution-actions-audit.md) | Close Finding 1 with a target-route resolution audit and documented follow-ups | PR #39, merge commit `b1b1307` |
| 2026-05-27 | [Member mobile PWA foundation audit](2026-05-27-member-mobile-pwa-foundation-audit.md) | Audit member and calendar phone viewport readiness, define implementation slices, and add baseline mobile Playwright coverage | merge commit `d7a1969` |
| 2026-05-27 | [Member mobile shell and navigation](2026-05-27-member-mobile-shell-and-navigation.md) | Harden member phone-first bottom navigation, quick actions, and member calendar shell continuity | merge commit `d7a1969` |
| 2026-05-27 | [Member check-in foundation](2026-05-27-member-checkin-foundation.md) | Add event-level mobile check-in enablement, member check-in cards/actions, and source-metadata-aware attendance writes | merge commit `d7a1969` |
| 2026-05-27 | [Member mobile release summary](2026-05-27-member-checkin-release-summary.md) | Consolidated software-factory summary for the member mobile audit, shell hardening, and check-in policy/location batch | merge commit `d7a1969` |
| 2026-05-27 | [Member check-in policy hardening](2026-05-27-member-checkin-policy-hardening.md) | Harden geofence validation and add ChurchAdmin mobile check-in policy audit visibility with regression tests | PR #40, merge commit `9dc8c52` |
| 2026-05-27 | [Children day session lifecycle](2026-05-27-children-day-session-lifecycle.md) | Start Finding 2B with explicit day session lifecycle controls and enabled-session check-in enforcement | PR #40, merge commit `9dc8c52` |
| 2026-05-27 | [Children parent session links](2026-05-27-children-parent-session-links.md) | Add session-scoped parent check-in/checkout URLs with safe unavailable states | PR #40, merge commit `9dc8c52` |
| 2026-05-27 | [Children parent self-service submissions](2026-05-27-children-parent-self-service-submissions.md) | Enable token-scoped parent check-in and checkout submissions for available day sessions | PR #40, merge commit `9dc8c52` |
| 2026-05-27 | [Children parent session security hardening](2026-05-27-children-parent-session-security-hardening.md) | Add anti-abuse rate limiting, session expiry policy, and custody/authorized checkout constraints | PR #40, merge commit `9dc8c52` |
| 2026-05-27 | [Phase 2 closure: safety and mobile coverage](2026-05-27-phase2-closure-safety-and-mobile-coverage.md) | Enforce session enablement readiness gates, stronger parent checkout verification, close-token invalidation, and expanded mobile/role coverage | PR #40, merge commit `9dc8c52` |
| 2026-05-31 | [Member mobile Phase 2 verification](2026-05-31-member-mobile-phase2-verification.md) | Verify current Finding 2/2A evidence, add a dedicated member mobile E2E command, and refresh stale tracker delivery metadata | PR #66 |
| 2026-05-29 | [Slice 5 security evidence closure](2026-05-29-slice5-security-evidence-closure.md) | Expand role-access and church-scope negative test evidence for recent competitive-readiness slices | Pending |
| 2026-05-29 | [Spanish i18n hardcoded passes](2026-05-29-spanish-i18n-hardcoded-pass.md) | Replace remaining hardcoded English copy in finance, member schedule, import, and public giving views with shared English/Spanish i18n lookups | Pending |
| 2026-05-29 | [Slice 6 communications guardrails and operator polish](2026-05-29-slice6-communications-guardrails.md) | Add server/UI dispatch guardrails for subject/body/schedule validation with focused communications action coverage | Pending |
| 2026-05-29 | [Findings 4/5/6 depth batch](2026-05-29-findings4-5-6-depth-batch.md) | Complete paid registration defaults, add import source adapters + commit flow, and expand security evidence matrix/docs | Pending |
| 2026-05-31 | [Wave B B2 payment follow-up operator UI](2026-05-31-wave-b-b2-payment-followup-operator-ui.md) | Add inline ChurchAdmin registration payment follow-up resolution controls and audit-trail display | PR #67 |
| 2026-05-31 | [Wave B B3 Stripe payment intent](2026-05-31-wave-b-b3-stripe-payment-intent.md) | Create and store Stripe Payment Intents for paid registrations and reconcile webhooks by intent ID | PR #68 |
| 2026-05-31 | [Wave B B4 paid registration checkout UI](2026-05-31-wave-b-b4-paid-registration-checkout-ui.md) | Add member/public paid-registration payment-required and payment-ready UI states | PR #69 |
| 2026-09-18 | [Tenant provisioning, RLS CI gate, and Council Review 10](2026-09-18-tenant-provisioning-rls-gate-and-council-review-10.md) | Generic tenant provisioning tool, blocking RLS CI gate fix, full whole-app Council Review 10, and Documenter close-out | PR #140, squash merge `d04a94c` |
| 2026-09-18 | [Language-translation skill install + Spanish catalog review](2026-09-18-language-translation-skill-and-es-review.md) | Install the `language-translation` skill, document the real Spanish/`es-PR` coverage and linguistic-review state, fix 7 objective catalog errors, and resolve automated PR review findings | PR #141 |
| 2026-09-20 | [Landing page Sacred Clarity redesign + Council Review 11](2026-09-20-landing-page-sacred-clarity-council-review-11.md) | Redesign the public landing page with a full marketing treatment, run a diff-scoped Council Review 11, fix all 5 actionable findings (contrast, responsive grid, touch target, honest social proof), correct an agent contrast-calculation error, and Documenter close-out | Pending |
| 2026-09-20 | [Error boundaries + Council Review 13](2026-09-20-error-boundaries-finance-tests-member-route-council-review-13.md) | Scoped error boundaries, finance batch-commit tests, `/app/member` close-out, and Council Review 13 | PR #145 |
| 2026-09-20 | [Webhook DLQ + Council Review 12](2026-09-20-webhook-dlq-finance-tests-aria-skeleton-council-review-12.md) | Webhook dead-letter queue, finance-import parser tests, ARIA/loading-skeleton fix, and Council Review 12 | PR #143 |
| 2026-09-22 | [Song library (Story 1) + Council Review 14](2026-09-22-song-library-setlist-council-review-14.md) | Song library and setlist builder (Service Planning Story 1) and Council Review 14 | PR #146 |
| 2026-09-22 | [Role taxonomy (Story 2) + Council Review 15](2026-09-22-service-planning-role-taxonomy-council-review-15.md) | Role taxonomy and team roster (Service Planning Story 2) and Council Review 15 | PR #147 |
| 2026-09-23 | [Comms retry/DLQ Copilot findings](2026-09-23-comms-retry-dlq-copilot-findings.md) | Communications retry/DLQ fixes from the Copilot review of PR #143 (Council Review 16) | PR #148 |
| 2026-09-23 | [Comms cron consent + Council Review 17](2026-09-23-comms-cron-consent-suppression-council-review-17.md) | Cron and secretary consent/suppression lookups, unauthenticated server actions, and Council Review 17 | PR #149 |
| 2026-10-04 | [G3.3 giving statements](2026-10-04-g3-3-giving-statements.md) | G3.3 year-end giving statements (admin preview, PDF, idempotent batch email, member self-download) | PR #181, `b29a255` |
| 2026-10-04 | [S22 OpenRouter gateway](2026-10-04-s22-openrouter-gateway.md) | S22 OpenRouter AI gateway (ADR 0027) | PR #183, `6faafb2` |
| 2026-10-05 | [G3.3b registration receipt](2026-10-05-g3-3b-registration-receipt.md) | G3.3b ChurchCore's receipt for a paid event registration | PR #184, `3ec4bf7` |
| 2026-10-05 | [G5.1 Resend live](2026-10-05-g5-1-resend-live.md) | G5.1 Resend live and provider error codes | PR #188, `12220b1` |
| 2026-10-06 | [S11 suppressions page](2026-10-06-s11-suppressions-page.md) | S11 church-admin suppressions page | PR #190, `9c16db3` |
| 2026-10-07 | [T1a untested exports](2026-10-07-t1a-untested-exports.md) | T1a untested exports at zero for giving, finance and communications | PR #193, `95a8483` |
| 2026-10-07 | [G4.1 vendor importers](2026-10-07-g4-1-vendor-importers.md) | G4.1 Planning Center and Breeze importers with fixtures in CI (Council Review 45) | PR #194, `b8b953e` |
| 2026-10-08 | [G4.2 import reconciliation](2026-10-08-g4-2-import-reconciliation.md) | G4.2 post-import reconciliation report (Council Review 46, ADR 0029) | Pending (no PR yet) |
