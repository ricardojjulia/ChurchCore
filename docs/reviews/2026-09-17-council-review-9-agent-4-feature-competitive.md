# Council Review 9 — Agent 4: Feature Completeness & Competitive Gap Analysis

**Date:** 2026-09-17 · **Branch:** feat/council-2-8-and-project-hq · **Read-only audit**

`DEVELOPMENT_PLAN.md` (dated May 26) and `docs/mvp-readiness-audit.md` (dated May 9) are both materially behind actual delivery — this round's Documenter close-out corrects `DEVELOPMENT_PLAN.md`'s status section; `mvp-readiness-audit.md` is left as a dated snapshot with a pointer added to newer sources.

## Workflow Completion by Module

| Module | % |
|---|---|
| Member Care | 85% |
| Volunteer Scheduling | 80% |
| Children's Check-in (CCM) | 85% |
| Events & Registrations | 75% |
| Giving & Finances | 80% |
| Communications | 75% |
| AI Governance | 60% |
| Project HQ (Governance) | 70% |
| **Weighted average** | **76%** |

## Role-Based Access Coverage

Super-Admin 95%, Church-Admin 95%, Pastor 85%, Ministry Leader 70%, Member/Volunteer 75%, Secretary/Office Admin 60%, Teacher (CCM-scoped) 50%. 107 tables / 244 RLS policies; cross-tenant denial verified in CI.

## Core Operations Workflows

Child Checkin/Checkout Security 85%, Double-Entry GL 80%, Communications Dispatch + Suppression 75%, Impersonation Gates 90%, HQ Governance Logging 70%, Tenant Data Erasure & Control-Plane CRUD — rated 85% at audit time on functional grounds, but flagged critical on safety grounds (see Agent 1); post-hardening (commit `268b915`) this is materially improved on audit trail and error honesty, though table-coverage completeness remains a tracked follow-up (ADR 0021).

## Competitive Gaps vs. Planning Center / Breeze / Tithe.ly

1. **Service planning depth** (largest gap) — no setlist builder, song library, or volunteer-role matching for services. Est. 3–4 weeks.
2. **Member mobile UX & check-in kiosk** — functional but not phone-first; no offline support. Est. 2–3 weeks.
3. **Recurring giving & donor statements** — one-time donations only; no recurring-gift management, tax receipts, or pledge tracking. Est. 4–5 weeks.
4. **Migration/import tooling maturity** — no incumbent-specific (Planning Center/Breeze) field mappers or post-import reconciliation checklist. Est. 3–4 weeks.
5. **Provider integration breadth** — Stripe/SendGrid/Twilio/Resend/Claude only; no accounting export (QuickBooks/Xero) or workflow integrations. Est. 6–8 weeks.

## MVP Readiness: 65/100

Strong architecture and security posture (RLS coverage, audit trail, Supabase-only enforcement) for a **controlled single-church pilot**. Not yet credible for broad market evaluation: service planning is missing, mobile isn't competitive, import onboarding needs coaching, and there is no evidence yet of an uncoached church completing onboarding end-to-end.

Phase status (per `docs/plans/mvp-competitive-go-no-go-checklist.md`):

- **Phase A (controlled pilot): GO.** Local smoke, readiness E2E, and role-boundary tests all pass.
- **Phase B (broad evaluator): NO-GO.** Onboarding UX needs hardening; mobile not phone-first; communications bounce/opt-in handling incomplete.
- **Phase C (compliance-first segment): NO-GO.** Service planning still missing.
- **Phase D (broad mid-market): buildable gates met, external validation gates failed** — zero churches have completed onboarding uncoached, zero incumbent migration dry-runs performed.

**Recommendation:** the next 4–6 weeks of product work should prioritize service planning, phone-first member UX, incumbent migration tooling, and running one real pilot church through onboarding uncoached — external validation, not more internal audits, is the binding constraint on Phase D.
