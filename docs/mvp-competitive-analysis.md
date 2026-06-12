# ChurchCore — MVP & Competitive Analysis

**Version:** 1.0
**Date:** 2026-06-12
**Status:** Active — update with each major release or significant competitive change

---

## 1. What ChurchCore Is

A compliance-first, multi-tenant SaaS platform for church operations targeting 100–1,000 average-attendance congregations. Built on Next.js 15 / Supabase (per-tenant database isolation) / Stripe / Vercel. Part of a three-product family alongside ChurchCore Care (counseling) and ChurchCore Academy (LMS).

The central product bet: every competitor built compliance as an afterthought and retrofitted security on top of features. ChurchCore inverted this — the database isolation, audit logs, role-level access control, and child-safety enforcement are architectural, not configurable settings.

---

## 2. MVP Status (as of June 2026)

The project tracks four gate levels via a weekly go/no-go scorecard. Current state:

| Gate | Status | Notes |
|---|---|---|
| MVP Today (controlled pilot) | **GO** | All required gates passing since 2026-05-29 |
| MVP +2 weeks (evaluator-ready) | **GO** | Promoted from CONDITIONAL GO on 2026-06-19 when Spanish coverage closed |
| Competitive 30 days (segment-wedge) | **GO** | All Phase C gates closed 2026-06-26 |
| Competitive 60 days (broad mid-market) | **PHASE D-READY** | All buildable gates closed 2026-07-10; external validation not yet completed |

**Phase D-READY vs. Phase D GO:** The technical product is complete at the competitive-60-days level. The remaining gap is not code — it is the first uncoached external evaluator session. No church outside the team has run the onboarding flow without hand-holding. That single signal is the remaining blocker to full Phase D GO.

---

### 2.1 What Is Built

| Module | Status |
|---|---|
| Member directory, families, RBAC (5 roles) | Full |
| Children's Check-in (CCM) — custody restrictions, two-adult rule, incident logging, session lifecycle | Full |
| Finance General Ledger — double-entry, fund mapping, journal posting, budget | Full |
| Giving — Stripe, fund-based, GL auto-posting, refund lifecycle, donor statements | Full |
| Events / Calendar — categorized, RSVP, registration, paid events | Full |
| Communications — email (Resend) + SMS (Twilio), consent enforcement, unsubscribe, auto-retry cron | Full |
| Volunteer scheduling / service plans | Full (worship depth maturing) |
| AI Ministry Tools — Sermon Planning AI Assist, Bible Study Q&A (Claude, theological guardrails, audit log) | Full |
| Import tooling — people, households, groups, events, attendance, giving (dry-run + commit, 3 vendor adapters each) | Full |
| Localization — English + Spanish (es-PR), governance framework with lifecycle state machine | Full |
| Member self-service portal — profile, giving history, groups, push notifications | Full |
| Church Operations — documents (AES-256-GCM encrypted elder notes), onboarding workflows | Full |
| Control-plane / tenant architecture separation | Full |
| CI gates — lint, build, unit tests (1,153 passing), RLS audit | Full |
| Demo environment + observability + feedback capture | Full |

### 2.2 What Is Partial or Missing

| Gap | Competitive impact |
|---|---|
| Native iOS/Android apps | High — Planning Center, Breeze, and ChurchTrac all have native apps |
| Integrations marketplace | Medium — currently Stripe + Resend + Twilio only |
| Deep analytics / custom report builder | Medium — basic reports exist; drill-down dashboards not yet built |
| Background check integration (Checkr / Ministrysafe) | Medium — CCM compliance story incomplete without it |
| Denomination / network oversight dashboard | Low now, high later — Phase 3 differentiation |
| AI pastoral engagement scoring | Low now, high later — Phase 3 moat |
| Advanced financial management (bank feed import, AP, 990-ready statements) | Low now, high later |

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

**Per-tenant Supabase isolation.** Each church runs in a completely isolated database. Cross-tenant data exposure is architecturally impossible, not just policy-controlled. Competitors use shared schemas. This is the claim church IT reviewers and denominational compliance officers will care about most.

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

The demo environment is live at `church-core-ops.vercel.app` with five seeded demo accounts covering all five roles. The buyer-facing competitive overview and security/privacy story are published in `docs/buyer/`. All five import entity types (people, groups, events, attendance, giving) are in place with dry-run preview, which removes the biggest switching objection from Planning Center/Breeze users.

The single most important next step is **not writing more code** — it is scheduling the first uncoached external evaluator session. The product is Phase D-READY; full Phase D GO requires one real church admin completing the onboarding flow without internal hand-holding.

---

## 6. Summary

ChurchCore has a genuine, defensible product with a meaningful technical moat in child-safety compliance, financial integrity, and tenant isolation. The competitive gaps are primarily in native mobile apps and brand recognition — both are distribution problems, not product problems. The Phase 3 differentiators (insurance partnership, denomination dashboard, AI engagement scoring) are plausible structural moats that no competitor is actively building at this price point. The immediate priority is external validation, not feature expansion.
