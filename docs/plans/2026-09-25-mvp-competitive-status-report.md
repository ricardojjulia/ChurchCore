# ChurchCore — MVP & Competitive Status Report

> **Update 2026-09-26:** the product owner removed real-church usage and testing-church feedback as gates. MVP is now defined as closing the five competitive gaps in §4; the Phase A–D verdicts in §3 and the "recruit a pilot church" step in §7 are superseded. See `DEVELOPMENT_PLAN.md` for the updated definition and working order.

**As of:** 2026-09-25 (`main` at `73680da`)
**Sources:** Council Reviews 9–18 (`docs/reviews/`), `DEVELOPMENT_PLAN.md`, and a direct check of the current code for each competitive gap. The code check is marked **(verified in code)** where it adds to, or corrects, what the Council reports say.

---

## 1. Bottom line

- **MVP readiness: 69 / 100.** It rose from 65, where it sat for five audit rounds, to 69 over the last week. The gains came from service planning (+2 to +4) and a blocking automated test net (+1).
- **Ready for a controlled pilot with one church (Phase A: GO).** Not ready for broader evaluators, compliance-first buyers, or the mid-market (Phases B–D: NO-GO).
- **The binding blocker for the mid-market is not engineering.** No church has completed onboarding without coaching, and no migration from a competitor has been dry-run against a real export. The most valuable next step for readiness is **recruiting a pilot church**. More code can't substitute for it.
- **Two production-safety issues should be fixed before any pilot handles real communications.** Communication logs have an access mismatch, and webhooks accept unsigned requests when a provider secret is unset (§5).

---

## 2. MVP readiness score over time

| Date | Council round | Score | What moved it |
|---|---|---|---|
| 2026-09-17 | Review 9 | **65** | Baseline set; five ranked competitive gaps identified |
| 2026-09-18 → 09-20 | Reviews 10–13 | 65 | Unchanged five rounds running: hardening work, no gap closed |
| 2026-09-22 | Review 14 | 66–67 | Service planning Story 1: song library and setlist builder |
| 2026-09-22 | Review 15 | 67–69 | Service planning Story 2: role taxonomy, team roster, skill matching |
| 2026-09-23 | Reviews 16–17 | 68 | Communications retry, dead-letter queue and consent fixes (correct, but on a path production barely exercises yet) |
| 2026-09-24 | Review 18 | **69** | Blocking E2E test net over every page, role and API route |

---

## 3. Launch phase gates

| Phase | Audience | Verdict | What stands in the way |
|---|---|---|---|
| **A** | One church in a controlled pilot | **GO** | Nothing blocking. Fix the two production-safety items first (§5). |
| **B** | Broad evaluators comparing against incumbents | **NO-GO** | The five competitive gaps in §4, above all service-planning depth and recurring giving |
| **C** | Compliance-first churches (safeguarding, finance audit) | **NO-GO** | Same gaps, plus the open access-control findings in §5 |
| **D** | Broad mid-market | **NO-GO** | The buildable gates are met. The blocker is **external validation**: zero churches onboarded uncoached, zero real-export migration dry-runs. |

---

## 4. Competitive position vs. Planning Center Online, Breeze ChMS and Tithe.ly

### 4.1 Ranked gaps (from Review 9; the order has held through Review 18)

| Rank | Gap | Status today | Remaining work |
|---|---|---|---|
| **1** | **Service planning depth** (setlists, song library, volunteer-role matching) | **~75% closed.** Stories 1 and 2 shipped and merged: song library, setlist builder with drag-and-drop and repeat-use warnings, typed role taxonomy with required skills, skill-ranked assignment pool, consolidated roster (PRs #146 and #147). | Story 3 (rotation planner, i.e. fatigue-aware auto-suggestions), Story 4 (rehearsal scheduling), Story 5 (make a service plan require its event). Estimate from Review 9: 3–4 weeks for the whole gap. |
| **2** | **Phone-first member experience and check-in kiosk** | **Partially built (verified in code).** An offline service worker exists (`public/sw.js`). A children's check-in kiosk component exists (`ccm-checkin-kiosk.tsx`). The member portal is tested at a 390×844 phone viewport on every PR. The Council's judgment is still "functional, not phone-first". | Phone-first polish of the member flows, plus a kiosk-grade check-in experience. The CI sweep found a missing heading on the calendar. Estimate: 2–3 weeks. |
| **3** | **Recurring giving and donor statements** | **Not usable yet (verified in code).** The database stores recurring gifts and can *cancel* a Stripe subscription, but nothing *creates* one: giving uses one-time payments only. Per-gift email receipts exist. There are no year-end or tax statements and no pledge tracking. | Recurring-gift creation, year-end giving statements, pledges. Estimate: 4–5 weeks. **The largest single gap against Tithe.ly.** |
| **4** | **Migration and import from incumbents** | **Further along than the gap list says (verified in code).** Import adapters with Planning Center and Breeze column mappings exist for people, attendance, giving, events and groups, each with a dry-run preview. Finance import reads CSV, Excel, QuickBooks IIF and OFX/QFX. | Post-import reconciliation (compare counts and totals against the source system) and a **real dry-run against an actual Planning Center or Breeze export**, which is also a Phase D blocker. Estimate: 3–4 weeks, but the dry-run needs a partner church's data. |
| **5** | **Provider integration breadth** | Stripe, SendGrid, Twilio and Claude are wired. **Resend, the documented primary email provider (ADR 0006), is not actually used for sending yet.** Email always goes through SendGrid. There is no accounting export (QuickBooks/Xero) and no workflow integrations. | Wire Resend (queued as F2), then accounting export. Estimate: 6–8 weeks for breadth. |

### 4.2 Where ChurchCore is ahead or at parity

- **Governance and safety architecture.** Row-level security is on every church-owned table and audited in CI. Tenant data is separated from the platform control plane. Pastoral notes are encrypted at rest, consent is logged, and the audit trail is hardened. Incumbents don't generally publish controls at this depth.
- **An AI ministry toolkit** (sermon planning, Bible-study Q&A) with consent gates and interaction logging. None of the three incumbents offers this natively.
- **Children's ministry** (check-in, check-out, incidents, authorized pickup, rooms) comparable in scope to Planning Center's check-ins.
- **Engineering discipline.** Every PR must pass a blocking browser and API suite: 809 end-to-end tests covering every page for every role, plus 1,707 unit tests. Every change must ship its own tests, and a 5-agent Council review is required before merge.
- **Bilingual interface** (English, Spanish, Puerto Rican Spanish) with a translation-governance workflow. Native-speaker review is still outstanding.

### 4.3 Where incumbents are clearly ahead

- **Recurring giving and statements.** Tithe.ly's core, and a hard expectation for any church evaluating a giving platform.
- **Service planning maturity.** Planning Center Services is the category standard. ChurchCore has closed about three quarters of the gap.
- **Ecosystem.** Accounting exports, integrations and native mobile apps.
- **Proof.** Incumbents have thousands of churches onboarded without hand-holding. ChurchCore has none yet.

---

## 5. Risks that matter before a pilot handles real data

These surfaced in Council Reviews 16–18. They're tracked, and the current behavior is pinned in tests so it can't change silently.

| Severity | Issue | Recommended timing |
|---|---|---|
| **High** | **Communication log access doesn't match the pages.** Secretaries are blocked from logs their pages let them open, and ministry leaders can read every church communication log directly even though the app denies them. | Next. Before any pilot uses communications. |
| **High in production** | **All four delivery webhooks accept unsigned requests if a provider's signing secret isn't configured.** Stripe's webhook also has no replay window. A missing configuration value could let forged payment or delivery events through. | With the webhook work (F4), before switching providers (F2) |
| Medium | The custom report export returns an error to signed-out users instead of redirecting them, and it reads the database in a way that bypasses row-level security. | Soon after |
| Medium | Project HQ (`/hq`) checks roles from a different source than the rest of the app, and its data isn't separated by church. | Before multi-church use of HQ |
| Low | An intermittent display glitch on the member home page (dates formatted without the church's time zone); a missing calendar heading; one dead readiness link. | Opportunistic |
| Process | 62 server actions have no dedicated tests yet. The list is explicit and enforced to only shrink; child safety and pastoral come first. | Ongoing (Story B of the testing work) |

**Communications status in plain terms:**
- Retries, dead-lettering, and suppression/consent checks are correct. Scheduled broadcasts now actually deliver (before Review 17 they silently reached nobody).
- Automatic retries still receive almost no real input. The email providers' error codes aren't mapped yet, and Resend isn't wired.

---

## 6. Module completion estimates

The last whole-app audit (Review 12, 2026-09-20) gave these estimates. The "since then" column lists work merged after it; those modules haven't been re-scored by a whole-app audit.

| Module | Review 12 | Since then |
|---|---|---|
| Member care | 85% | — |
| Volunteer scheduling / service planning | 80% | Service planning Stories 1–2 merged; gap #1 ~75% closed |
| Children's ministry (check-in) | 85% | — |
| Events & registrations | 75% | — |
| Giving & finances | 80% | Unchanged; recurring giving still not creatable (§4.1) |
| Communications | 75% | Retry, dead-letter and consent fixes; scheduled broadcasts now deliver; Resend still unwired |
| AI governance | 60% | — |
| Project HQ | 70% | New findings (§5) |
| **Weighted average** | **76%** | A whole-app re-audit is due to re-baseline |

**Role coverage (Review 12):** Super-admin 95%, Church admin 95%, Pastor 85%, Volunteer 75%, Member 75%, Ministry leader 70%, Secretary 60%, Teacher 50%. Secretary is the weakest, and it's now tied to the High access-control finding in §5.

---

## 7. Recommended path

1. **Now: close the two High-severity items** (communication-log access, webhook fail-open with F4). These are prerequisites for a safe pilot.
2. **In parallel: recruit a pilot church.** It's the only thing that moves Phase D. Ideally it's a church willing to share a Planning Center or Breeze export, which also turns gap #4's real-export dry-run from theory into evidence.
3. **Close recurring giving (gap #3).** It's the biggest remaining competitive hole and the most visible one to evaluators.
4. **Finish service planning (Stories 3–5)** to take gap #1 from ~75% to done.
5. **Wire Resend and map provider error codes (F2)** so communications reliability is real in production.
6. **Testing Story B:** end-to-end journeys for communications, child safety, service planning, pastoral care and giving, and burn down the 62 untested actions.
7. **Run a whole-app Council audit** to re-baseline the module percentages. The last one is from Review 12.

---

## 8. Housekeeping

- `docs/plans/mvp-competitive-go-no-go-checklist.md`, `docs/mvp-competitive-analysis.md`, and the README banner claiming "Phase D-READY" predate Review 9. They conflict with this report and `DEVELOPMENT_PLAN.md`, and they should be archived or reconciled.
- The CI checks (`verify` and the four `e2e` shards) block merges only once a repository admin marks them as required status checks in GitHub.
