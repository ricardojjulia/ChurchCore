# Roadmap

A short summary of where ChurchCore is heading. **The tracker is authoritative:** [`DEVELOPMENT_PLAN.md` §0](../DEVELOPMENT_PLAN.md#0-mvp-roadmap-to-november-6-2026-tracker) holds every open row, its estimate, its definition of done and its status. This page only points into it, and when the two disagree, §0 wins.

---

## Where We Are

- **MVP target:** Friday, **November 6, 2026** ([§0.1](../DEVELOPMENT_PLAN.md#01-target-and-rules)).
- **MVP readiness:** **89/100** (Council Review 44, 2026-10-06). Round-by-round history is in the plan's "MVP readiness history" and in [`docs/reviews/`](reviews/).
- **MVP means:** all five competitive gaps meet their definition of done, the production-safety track is complete, and the release checklist (§0.6) passes. The gaps, ranked against Planning Center Online, Breeze ChMS and Tithe.ly:
  1. Service planning depth — **closed** (M1).
  2. A phone-first member experience and a check-in kiosk — open (M4).
  3. Recurring giving and donor statements — **closed**.
  4. Migration from incumbents, with reconciliation — open (M4).
  5. Provider breadth: Resend — **closed** (Resend live in production since 2026-10-06).
- **Production-safety track:** complete (M2 met 2026-10-02).
- **Before live giving is announced:** owner action O7 (platform Stripe Connect setup and a real test-mode run) — see §0.3 "Owner actions".

Competitive positioning, pricing and structural strengths: [mvp-competitive-analysis.md](mvp-competitive-analysis.md).

---

## Milestones

| Milestone | Date | Exit criteria (summary of §0.2) | Status |
| :--- | :--- | :--- | :--- |
| **M0** | Mon Sep 28 | CI checks required on `main`; roadmap merged | Done (O1, 2026-10-01) |
| **M1** | Fri Oct 2 | Gap 1 (service planning) closed | Met 2026-09-30 |
| **M2** | Fri Oct 9 | Production-safety track complete | Met 2026-10-02 |
| **M3** | Fri Oct 23 | Gap 3 and Gap 5 closed; giving, finance and comms untested exports at zero | Gaps 3 and 5 closed; **T1a** remains |
| **M4** | Fri Oct 30 | Gaps 2 (phone-first and kiosk) and 4 (migration) closed | Open |
| **M5** | Fri Nov 6 | Whole-app Council re-baseline and Testing Council full run pass; release checklist passes; **MVP released** | Open |

### Remaining Must rows

| Milestone | Rows (see §0.3 for the definition of done) |
| :--- | :--- |
| M3 | **T1a** — untested exports: giving, finance, comms |
| M4 | **G2.1** phone-first member flows · **G2.2** kiosk self check-in · **G4.1** published-format import fixtures in CI · **G4.2** post-import reconciliation |
| M5 | **T1b** untested exports: child safety, pastoral · **T2** journeys for the remaining core workflows · **R1** whole-app Council re-baseline and Testing Council full run · **R2** MVP release |

The cut line (§0.4) decides what moves if a milestone is at risk: scope is cut to meet the date, quality never is.

---

## After the MVP

Everything deliberately deferred is listed, with its reason, in [§0.5 "Deferred to after MVP"](../DEVELOPMENT_PLAN.md#05-deferred-to-after-mvp). Highlights:

- **Accounting export** (QuickBooks IIF and Xero CSV, G5.2) and **rehearsal scheduling** (G1.7) — cut on 2026-09-29 to hold the November 6 date.
- **Design:** a light-mode option and D2, visual parity beyond colour ([ADR 0026](adr/0026-churchcore-design-system-parity.md)).
- **AI:** an AI model evaluation harness, and LLM-driven ShepherdAI gated on an explicit AI-consent decision ([ADR 0027](adr/0027-openrouter-ai-gateway.md)).
- **Giving:** an admin creating a recurring gift on someone's behalf.
- **Localization:** native-speaker review of `es`/`es-PR` and coverage for unwired modules.
- **Platform:** workflow integrations and native mobile apps (explicitly post-MVP in the gap definitions).

**Should** and **Stretch** rows (for example S17 resume an unpaid registration, S18 Portuguese locale, S20 update the card on a recurring gift, G3.4 pledges and campaigns) are in the §0.3 tracker tables.

---

## How This Is Kept Current

The plan's §0 is updated on every merge, and the Council's Documenter seat closes each review by updating the plan, the [CHANGELOG](../CHANGELOG.md) and the docs ([improve-software.md](../improve-software.md)). This page changes only when a milestone is met or the MVP definition changes.
