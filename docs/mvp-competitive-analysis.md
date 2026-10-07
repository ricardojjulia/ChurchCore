# ChurchCore — MVP & Competitive Analysis

> **Refreshed 2026-10-07.** Sections 1, 2, 3.3 and 5-6 now reflect the current MVP definition (five competitive gaps, Nov 6, 2026 release). The retired Phase A-D gate framework this document used to describe is gone from the status sections. The source of truth for status is `DEVELOPMENT_PLAN.md` §0 (the tracker) and `CHANGELOG.md`; the ranked gaps are in `docs/plans/2026-09-25-mvp-competitive-status-report.md`. If this document and the plan disagree, the plan wins.
>
> **Sourcing note.** Statements about ChurchCore are checked against the repo. Statements about competitors (pricing, features, app-store presence, market position) in sections 3-4 are carried over from the June 2026 version and are **not sourced anywhere in this repo**; treat them as unverified positioning notes to re-check before external use.

**Version:** 2.0
**Date:** 2026-10-07
**Status:** Active — update with each milestone (M3 Oct 23, M4 Oct 30, M5 Nov 6) or significant competitive change

---

## 1. What ChurchCore Is

A compliance-first, multi-tenant SaaS platform for church operations targeting 100–1,000 average-attendance congregations. Built on Next.js / Supabase (shared tenant database, row-level security by `church_id`, a separate control-plane database; see ADR 0028) / Stripe / Vercel. Part of a three-product family alongside ChurchCore Care (counseling) and ChurchCore Academy (LMS).

The central product bet: compliance and security are architectural, not configurable settings. Row-level security, append-only audit logs, role-based access control, and child-safety enforcement sit in the database and server layers, not only in the UI.

---

## 2. MVP Status (as of 2026-10-07)

The MVP is defined as closing five competitive gaps by **November 6, 2026** (M5). The old Phase A–D go/no-go gates are retired. Status per `DEVELOPMENT_PLAN.md` §0:

| Gap | Status |
|---|---|
| 1. Service planning (song library, setlists, role taxonomy, rotation planner) | **Closed** (M1 met 2026-09-30) |
| 2. Phone-first member flows and kiosk check-in | **Open** (G2.1, G2.2; milestone M4, Oct 30) |
| 3. Online and recurring giving, and statements | **Closed** (G3.0–G3.3b: card form, Stripe Connect per-church accounts, recurring gifts and installments, year-end statements, registration receipts) |
| 4. Migration from incumbents, with reconciliation | **Open** (G4.1 incumbent-format fixtures, G4.2 reconciliation; M4) |
| 5. Provider breadth: Resend | **Closed** (G5.1; Resend live in production 2026-10-06) |

Other milestones: M1 (Gap 1) and M2 (production-safety track, S1–S6, S9, S10) are met. M3 (Oct 23) is met when the test-coverage row T1a merges. Remaining before release: M4 (Gaps 2 and 4), child-safety and pastoral test coverage (T1b), core-workflow journeys (T2), the whole-app Council re-baseline plus the Testing Council full run (R1), and the release checklist (R2). Readiness is scored by the Council at 89/100 on the last Council round (Review 44); the plan's readiness line carries the current figure.

**What remains is both code and validation.** There is no partner-church pilot gate any more: migration is validated against the incumbents' published export formats (G4.1), not a partner church's data.

---

### 2.1 What Is Built

| Module | Status |
|---|---|
| Member directory, families, RBAC (5 roles) | Built |
| Children's Check-in (CCM) — custody restrictions, two-adult rule, incident logging, session lifecycle | Built; untested-export waivers remain (T1b) and kiosk mode is open (G2.2) |
| Finance General Ledger — double-entry, fund mapping, journal posting, budgets | Built. T1a (2026-10-07) added tests and fixed finance writes that reported success when the database refused them |
| Giving — Stripe Connect Standard accounts (each church takes gifts on its own Stripe account, direct charges), card form, one-time, recurring and installment gifts, GL auto-posting, refund lifecycle, year-end donor statements, receipts | Built (Gap 3 closed). Open: update-card and cancel-abandoned-setup flows (Should rows S20, S21) |
| Events / Calendar — categorized, RSVP, registration, paid events with a card form and a ChurchCore receipt | Built |
| Communications — email via Resend (SendGrid fallback), SMS via Twilio, consent enforcement, unsubscribe, retry cron and dead-letter queue, delivery webhooks that verify each provider's real signature scheme, a Suppressions page | Built (Gap 5 closed). Twilio SMS provider verification is not part of MVP rows |
| Service planning — song library, setlists, role taxonomy, rotation planner, volunteer scheduling | Built (Gap 1 closed) |
| AI — Sermon Planning AI Assist, Bible Study Q&A, and the HQ advisor through an OpenRouter gateway (ADR 0027), theological guardrails, audit log | Built |
| Import tooling — people, households, groups, events, attendance, giving (dry-run + commit, vendor adapters) | Built; incumbent-format fixtures and reconciliation are open (G4.1, G4.2) |
| Localization — English + Spanish (es-PR) with a governance framework | Partial: about half the app is wired to the catalog, and a native-speaker review has not been done |
| Member self-service portal — profile, giving history, groups | Built; phone-first polish open (G2.1) |
| Church Operations — documents (AES-256-GCM encrypted pastoral fields), onboarding workflows | Built |
| Control-plane / tenant architecture separation | Built (ADR 0028) |
| Design system — ChurchCore Design System through the Mantine theme, dark-first (ADR 0026), with a colour ratchet test | Built |
| Test and CI governance — `verify` job and four `e2e` shards required on `main`; every page × every role and every API route covered by a coverage manifest (`npm run test:surfaces`); Council v2 review before non-trivial merges | In place. 2,646 unit tests pass at T1a; 54 untested-export waivers remain, down from 62 |
| Demo environment, observability, feedback capture | Built |

### 2.2 What Is Partial or Missing

| Gap | Impact | Tracked as |
|---|---|---|
| Phone-first member flows, kiosk check-in | High — a visible evaluator-demo gap | G2.1, G2.2 (Must, M4) |
| Migration fixtures against incumbent export formats, with reconciliation | High — the main switching objection | G4.1, G4.2 (Must, M4) |
| Whole-app Council re-baseline and Testing Council full run | Release gate | R1 (Must, M5) |
| Untested exports: 54 waivers remain across 11 modules (`app/actions.ts` 18, `ccm-actions` 6, `church-admin-actions` 6, `elders-actions` 8, `groups-actions` 6, calendar 3, and a few single-export modules) | Risk-heavy child-safety and pastoral modules are T1b; the rest are post-MVP | T1b (Must); rest in §0.5 |
| Native iOS/Android apps | High, per the June analysis (unverified competitor claim) | Not planned for MVP |
| Integrations marketplace | Medium — Stripe, Resend, Twilio only | Post-MVP |
| Deep analytics / custom report builder | Medium | Post-MVP |
| Background check integration | Medium | Post-MVP |
| Denomination / network oversight dashboard, AI pastoral engagement scoring, bank-feed import and accounting export | Later differentiation | Post-MVP (§0.5) |

---

## 3. Competitive Landscape

### 3.1 Head-to-Head Map

| Competitor | Entry price | Full price | Core weakness | ChurchCore position |
|---|---|---|---|---|
| Planning Center | ~$14/mo (People only) | $100–$300+/mo (all modules) | Per-module pricing adds up fast; no GL; no real child-safety compliance layer | 30–45% cheaper for comparable feature set; wins on GL and CCM compliance |
| Pushpay + CCB | ~$200/mo | $500–$1,500+/mo | Acquisition baggage; CCB UX is legacy; expensive | Wins on price, modern stack, compliance architecture |
| Ministry Platform | $500+/mo | $1,000–$3,000+/mo | IT-heavy; not SMB-friendly | Wins on price, self-serve onboarding, simpler setup |
| Breeze / Tithely | $72/mo | $72/mo | No real financials; no CCM compliance | Wins on GL, CCM, AI tools, import depth; Breeze wins on simplicity |
| ChurchTrac | $50–$150/mo | $150+/mo | Weak compliance layer; basic financials | Wins on GL, compliance architecture; ChurchTrac wins on native app ecosystem and emergency text |

---

### 3.2 Where ChurchCore Wins Outright Today

**Double-entry General Ledger.** No competitor under $500/mo includes a real GL. Planning Center has no accounting at all. Pushpay/CCB has partial accounting in CCB. A church bookkeeper currently spends 4–8 hours/month manually reconciling Stripe/Planning Center exports into QuickBooks. ChurchCore eliminates that.

**Giving → GL auto-posting.** Every donation creates a balanced journal entry automatically. This alone closes a workflow gap no competitor addresses at this price point.

**bcrypt-hashed child check-in PINs.** Planning Center stores PINs reversibly. ChurchCore hashes them at write time — the plain PIN cannot be recovered from the database even by an attacker with full DB read access. This is a structural, not configurable, advantage.

**Custody restriction enforcement with UI blocking.** Competitors have basic notes fields. ChurchCore surfaces custody alerts at the point of checkout and enforces authorized-pickup lists in the check-in flow.

**Two-adult rule enforcement.** ChurchCore blocks session opens when a room is not two-adult covered and requires a documented override reason. No competitor enforces this at the database layer.

**Database-enforced tenant isolation.** Churches share one tenant database, and every church table is isolated by `church_id` with PostgreSQL row-level security enforced by the database engine, not just by application code. A CI audit (`npm run audit:rls`) blocks any church table without RLS. It is layered with a separate control-plane database, church-scoped server writes, privileged functions that take their actor only from the signed session, and AES-256-GCM encryption of pastoral fields ([ADR 0028](adr/0028-shared-tenant-database-layered-isolation.md)). This is the claim church IT reviewers and denominational compliance officers will care about most, and it is accurate as stated: it is isolation by enforced policy in a shared database, not separate databases per church.

**Audit-append-only logs.** Consent logs, giving records, and role-sensitive actions are append-only. There is always a reconstructable record even after personnel changes.

---

### 3.3 Where ChurchCore Trails Today

**Native mobile apps.** Planning Center's Church Center app, Tithely's member app, and ChurchTrac's Church Connect are all in the App Store and Google Play. ChurchCore members access via mobile web. This is the most visible gap in an evaluator demo.

**Brand recognition.** Planning Center is the default choice for mid-size evangelical churches. Breeze is the default for smaller churches. ChurchCore has no installed base yet and no name recognition — this is a pure cold-start problem, not a product quality problem.

**Integrations ecosystem.** Planning Center has a broader API and more third-party integrations. ChurchCore is Stripe + Resend + Twilio. A church using Church Community Builder or a custom website tool will immediately notice the gap.

**Volunteer scheduling depth.** Service plans and position assignments are in place, but conflict resolution, automated scheduling, and substitute request workflows are still maturing relative to Planning Center Services.

---

### 3.4 Structural Moat (Phase 3 — Not Yet Built)

These are capabilities no competitor is building at the target price point. When built, they make ChurchCore structurally unattractive to replace:

- **Insurance carrier CCM partnership.** ChurchCore CCM generates a live, verifiable compliance record that church liability carriers (Church Mutual, GuideOne, Brotherhood Mutual) can use to offer documented premium discounts. No competitor is pursuing this model.
- **Denomination / network oversight dashboard.** Aggregate CCM compliance, giving trends, and ministry progress across 10–500 affiliated churches. No affordable competitor supports this.
- **AI pastoral engagement scoring.** Declining-engagement detection and follow-up task creation using church-scoped private inference — no data crosses tenant boundaries or goes to third-party APIs with retention.
- **COPPA compliance engine.** Automatic retention schedules and purge workflows for children's data. Privacy lawyers reviewing church software will recommend ChurchCore to clients.

---

## 4. Pricing Position

| Tier | Price | Target | vs. Planning Center |
|---|---|---|---|
| Starter | $59/mo | Under 100 attendance | PC equivalent costs $50–100 with fewer features |
| Growth | $99/mo | 100–500 attendance | PC equivalent costs $100–180; ChurchCore includes GL |
| Pro | $179/mo | 500–2,000 attendance | PC equivalent costs $200–300+; ChurchCore includes AI tools |
| Enterprise | Custom | 2,000+ / denominations | N/A |

ChurchCore is approximately 30–45% cheaper than Planning Center for a comparable feature set, and the GL is a feature Planning Center cannot match at any price.

Infrastructure break-even is ~50 churches on the Growth tier. $18K MRR profit is achievable at roughly 275 churches blended across tiers.

---

## 5. Go-to-Market Readiness

A demo environment with seeded accounts for all five roles exists (see `docs/runbooks/` and `HOWTO.md`; the demo URL is not re-verified in this refresh). The buyer-facing overview and security/privacy story are in `docs/buyer/`. Import covers people, households, groups, events, attendance and giving with dry-run preview; incumbent-format fixtures and reconciliation (G4.1, G4.2) are what remain before migration counts as closed.

The retired "first uncoached external evaluator session" gate is no longer an MVP criterion (`DEVELOPMENT_PLAN.md` §0.1). The path to release is the remaining Must rows, the whole-app Council re-baseline plus Testing Council run (R1, M5), and the release checklist (R2). Paying customers and brand recognition remain distribution questions the MVP does not answer.

---

## 6. Summary

As of 2026-10-07, three of five competitive gaps are closed (service planning, online and recurring giving with statements, Resend), on a base of database-enforced tenant isolation, append-only audit, child-safety enforcement and a CI that exercises every page for every role. The remaining MVP work is phone-first and kiosk flows (Gap 2), migration fixtures with reconciliation (Gap 4), test coverage of the child-safety and pastoral modules, and the whole-app re-baseline. The Phase 3 differentiators in section 3.4 remain post-MVP.
