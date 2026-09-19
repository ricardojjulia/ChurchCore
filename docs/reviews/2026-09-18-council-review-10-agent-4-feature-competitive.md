# Council Review 10 — Agent 4: Feature Completeness & Competitive Gap Analysis

**Date:** 2026-09-18
**Scope:** Whole-app audit (read-only), per `improve-software.md` §2 Phase 1 prompt, verbatim.

---

## 1. Workflow Completion by Core Module

| Module | Completion | Notes |
|---|---|---|
| **Member Care** | **85%** | Profiles, families, households, member status, pending-review workflow wired. Missing: self-service data export maturity. |
| **Volunteer Scheduling** | **80%** | Service plans, coverage tracking, session confirmation system, burnout vitality analytics. Missing: reminders, absence-workflow closure. |
| **Children's Check-in (CCM)** | **85%** | Day-session lifecycle, room/volunteer readiness gates, audited overrides, parent checkout verification, incident tracking. Missing: classroom mobile app, medical note encryption tuning. |
| **Events & Registrations** | **75%** | Calendar, RSVPs, registration forms, approval workflow, household-aware registration, paid-event ledger. Missing: service-planning depth, setlist builder, volunteer-role matching. |
| **Giving & Finances** | **80%** | Donations, fund mapping, GL double-entry (journals, budgets, imports), reconciliation queues. Missing: recurring giving, donor tax statements, vendor accounting exports. |
| **Communications** | **75%** | Provider adapters (Resend/Twilio), send lifecycle, delivery queue, consent enforcement, audit logs. Missing: real webhook retry/suppression automation, bounce reconciliation. |
| **AI Governance & Ministry Tools** | **60%** | Claude-powered sermon planning, Bible study Q&A, prompt governance framework. Missing: daily prayer send-outs, personalized small-group plans, confidence disclaimers refinement. |
| **Project HQ (Governance Dashboard)** | **70%** | Readiness summaries, operational lanes, tenant CRUD, audit logging. Missing: richer inline settings, advanced filtering UI. |
| **Weighted Average** | **76%** | Usable for controlled pilot; gaps cluster in mobile UX, service depth, and competitor-parity features. |

---

## 2. User Role-Based Access Coverage

- **Super-Admin:** 95% — Control-plane staff, tenant override, platform auditing gates working.
- **Church-Admin:** 95% — All operational and sensitive routes enforcing role gates. Import commit, event approval, finance post actions verified.
- **Pastor:** 85% — People/family visibility, pastoral care notes, discernment tools, suggested-workflow triage. Gap: cannot approve registrations without church-admin role.
- **Ministry-Leader:** 70% — Ministry roster, volunteer assignment, team communication. Gap: limited to assigned ministry scope; cross-ministry visibility restricted by design.
- **Member/Volunteer:** 75% — Profile, family, schedule, giving, groups, check-in where enabled. Gap: recurring-giving interface missing.
- **Secretary/Office-Admin:** 60% — Daily Desk, calls, visits, calendar coordination. Gap: full people-edit and financial-review permissions not available; by design to reduce risk.
- **Teacher (CCM-scoped):** 50% — Check-in/checkout, incident reporting, room roster. Gap: no access to child medical notes, only supervisors; limited to day-session scope.

**RLS enforcement:** 107 tables / 244 policies active; `audit-rls` script blocks CI when coverage drops (as of this council round — see synthesis §3); cross-church denial verified in test suite.

---

## 3. Core Operations Workflows — Completion Ratings

| Workflow | Rating | Status |
|---|---|---|
| **Child Checkin/Checkout Security** | **85%** | Two-adult readiness enforced; custody restrictions verified; PIN/QR checkout working; session token rotation on close. Pending: offline mobile fallback. |
| **Double-Entry General Ledger** | **80%** | Chart of accounts, journal posting, budget tracking, giving-to-GL reconciliation active. Pending: automated reversal for refunds (foundation laid). |
| **Communications Dispatch + Suppression** | **75%** | Send queue, consent checks, unsubscribe handling, delivery audit log. Missing: live webhook retry/bounce processing; stuck in manual operator triage. |
| **Impersonation Gates** | **90%** | Church-admin impersonation surfaces audit trail; session data loader enforces admin-only access; RLS does not bypass. |
| **HQ Governance Logging** | **70%** | Audit trail wired for sensitive writes (people, finance, children, communications). Missing: comprehensive table coverage (ADR 0021 flagged for follow-up). |
| **Tenant Erasure & Data Cleanup** | **85%** | Control-plane tenant CRUD, data deletion framework. Hardened post-Commit 268b915; audit trail honesty improved; table-scope completeness tracked as follow-up. |

---

## 4. Competitive Gaps vs. Planning Center Online / Breeze / Tithe.ly

**Critical gaps ranked by market impact:**

1. **Service Planning Depth (largest blocker)** — No worship-element builder, song library, volunteer-role assignment for services. Estimated effort: 3–4 weeks. Market impact: HIGH.
2. **Member Mobile UX & Check-in Kiosk** — Functional but not phone-first; no offline support; no native app. Estimated effort: 2–3 weeks. Market impact: HIGH.
3. **Recurring Giving & Donor Statements** — One-time donations only; no recurring-gift management, tax receipts, pledge tracking. Estimated effort: 4–5 weeks. Market impact: MEDIUM-HIGH.
4. **Migration/Import Tooling Maturity** — No Planning Center or Breeze field mappers; no post-import reconciliation checklist or dry-run confidence scoring. Estimated effort: 3–4 weeks. Market impact: MEDIUM.
5. **Provider Integration Breadth** — Only Stripe/SendGrid/Twilio/Resend/Claude; no accounting export (QuickBooks/Xero), CRM integration, or workflow builders. Estimated effort: 6–8 weeks. Market impact: MEDIUM.

**Defensible advantages:** Finance + child safety + role-based auditability + tenant isolation remain competitive if positioned correctly.

---

## 5. MVP Readiness Score: 65/100

**Strengths:** RLS architecture is production-grade; audit trail foundation solid; ChurchAdmin weekly readiness path proven in E2E; local smoke tests reliable; role-access matrix covered by tests.

**Risks:** Service planning missing (replacement blocker); mobile not phone-first (usability blocker); onboarding UX needs hardening; zero external validation (one uncoached church completing onboarding end-to-end).

**Phase status (per go/no-go checklist):**
- **Phase A (controlled pilot): GO** — local setup, smoke, readiness E2E, and role-boundary tests pass.
- **Phase B (broad evaluator): NO-GO** — onboarding UX incomplete; mobile not competitive; communications webhook handling incomplete.
- **Phase C (compliance-first segment): NO-GO** — service planning still missing.
- **Phase D (broad mid-market):** buildable gates met; external validation gates failed — zero churches have completed onboarding uncoached; zero incumbent migrations trialed.

**Binding constraint on advancement:** not more code — external validation. The product needs one real church to complete onboarding and run a week uncoached before Phase B/C claims are credible.

---

## 6. Tests Likely Needed

- Role-denied route browser coverage (expand Playwright from readiness to denied-role assertions across all ChurchAdmin surfaces).
- Service-planning dry-run and approval workflow tests before feature ships.
- Mobile viewport regression tests (phone-sized component sanity at 390px; offline fallback simulation).
- Recurring-giving state machine tests (pending, active, paused, completed, failed states with GL posting).
- Incumbent export parser tests (Planning Center, Breeze CSV field mapping with duplicate detection).
- Webhook idempotency and retry logic tests for provider events (SendGrid bounce, Twilio delivery, Stripe refund reconciliation).

---

## 7. Open Questions

1. External validation timeline: when is the first uncoached church pilot scheduled, and what is the acceptance threshold?
2. Service-planning scope: should setlist/volunteer-role-matching be in Phase B or Phase C?
3. Mobile native apps: after phone-web reaches parity, is native iOS/Android planned, or stay PWA-first?
4. Provider breadth: which three accounting/CRM integrations (of five) are highest priority for Phase D go-to-market?

---

**Note:** this round's findings are numerically identical to Council Review 9's Agent 4 report (`docs/reviews/2026-09-17-council-review-9-agent-4-feature-competitive.md`) and to the standing `competitive_roadmap_priorities.md` memory entry. That is expected, not a sign of a rerun error — none of these modules changed between 2026-09-17 and this round; this branch's actual changes (generic tenant provisioning tool, CI RLS-audit gate) are infrastructure/tooling, out of scope for a feature-completeness audit. Confirms these priorities are still current.
