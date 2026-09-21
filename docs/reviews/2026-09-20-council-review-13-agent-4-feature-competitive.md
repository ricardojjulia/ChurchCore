# Council Agent 4: Feature Completeness & Competitive Readiness Audit

**Branch audited:** `fix/error-boundaries-finance-tests-member-route`
**Status:** Green for merge; MVP readiness unchanged at 65/100

---

## 1. Workflow Completion by Module

| Module | Progress | Key Gaps |
|---|---|---|
| Member Care | 90% | Household approval workflow mature; self-service profile editing complete. |
| Volunteer Scheduling | 70% | Basic assignment, burnout guardrails, vitality scoring live. Shift confirmation + coverage forecasting deferred. |
| Children's Check-in | 85% | Session-scoped parent links, two-adult coverage gates, custody verification complete. Kiosk app out of scope. |
| Events & Registrations | 70% | Categorized calendar, RSVP, paid registrations via Stripe, refund lifecycle complete. Service planning still shallow vs. competitors. |
| Giving & Finances | 80% | Donations, journal entries, journal posting, budgets, import from 5 formats all working. Recurring giving not implemented. |
| Communications | 60% | SendGrid/Twilio dispatch, retry cron, consent tracking, suppression UI live. Push notifications and production webhook verification pending. |
| AI Governance | 30% | Sermon planning + Bible study Q&A only. Prayer journaling, weekly guides deferred. |

Core church operations (members, finance, check-in, giving, events) are 75–90% feature-complete. Advanced differentiation (AI ministry tools, mobile push, recurring giving, service-planning depth) remains 30–60% — consistent with Phase A GO / Phase B+ NO-GO.

---

## 2. User Role Coverage

Unchanged from Council Review 12 (this branch does not touch role/access code): Super-Admin 95%, Church-Admin 85%, Pastor 70%, Secretary 50%, Ministry-Leader 60%, Teacher 40%, Member 65%. All sensitive routes (import commit, communications, children safety, finance) deny non-admin roles via action-level checks and RLS; no cross-church leaks identified in the last three Council rounds.

---

## 3. Core Operations Workflows

### Finance-Import Batch-Commit Workflow

**Parser coverage (Council Review 12): 27 tests** across `parseCsv`, `parseXlsx`, `parseOfx`, `parseIif`, `parsePlainText`, `detectFormat`, and helpers — unchanged on this branch.

**Batch-commit workflow coverage (new this branch, `app/app/finance-actions.test.ts`): 3 tests**
- Local fallback mode: creates import record, journal, journal lines; updates import status to completed; asserts the exact debit/credit `finance_journal_lines` insert parameters (account id, amount, sort order).
- Account-code resolution: debit/credit code lookup resolves to the correct account id before posting, falling back to the caller's defaults when a row has no mapped code.
- Supabase path: same workflow via the Supabase client (mocked insert/update/select chain), asserting the same journal-line content.

I initially characterized this as leaving "no test verifying GL posting output" as a residual gap, reasoning that the workflow "creates a journal... but no test asserts that journal lines actually post to GL ledger accounts." **Agent 1 checked this against source and I agree with the correction**: in this double-entry schema, `finance_journal_lines` rows *are* the GL entries, and the three new tests assert their exact debit/credit/account content. I also referenced a "GL auto-posting on journal post via background process (Supabase functions or backend cron)" in an earlier pass at this report — Agent 1 checked and found no such process exists (`postJournalAction` only flips `finance_journals.status` from `draft` to `posted`; the only GL-adjacent cron/webhook path, `donation_gl_posts`, belongs to the separate Stripe-donation flow). I was likely conflating that donation flow with finance-import. Retracting that claim. See the synthesis for the resolved framing.

**Revised verdict:** finance-import's batch-commit path (create import → create journal → insert debit/credit lines → mark completed) now has adequate unit-test coverage for both storage backends. No further test-coverage gap identified for the code that actually exists.

### Other workflows (unchanged from Review 12, not touched by this branch)
- Double-Entry General Ledger structure: 90/100.
- Resend/Twilio dispatch with suppression: 75/100.
- Impersonation gates: 85/100.
- ADR/HQ Governance logging: 80/100.

---

## 4. Competitive Gap Analysis (unchanged from Review 12)

1. Service planning depth — HIGH.
2. Mobile member UX — HIGH.
3. Recurring giving — MEDIUM.
4. Migration tooling — MEDIUM.
5. Provider breadth — MEDIUM/Phase D.

None of these were in scope for this branch.

---

## 5. MVP Readiness Score

**65/100 — unchanged for a 5th consecutive round (Reviews 9, 10, 11, 12, 13).** Phase A GO, Phase B/C GO-with-caveats per Review 12's phase breakdown, Phase D blocked on external validation (no church has completed onboarding uncoached; no real migration dry-run performed), not on further engineering.

---

## 6. Recommended Next Actions

**For this branch:** no blockers. Error boundaries, finance test coverage, and the `/app/member` question are all independently verifiable and closed. No ADR needed — existing patterns (Sentry + Mantine error UI, the loading.tsx convention, the existing action-test mocking pattern) were reused, nothing new was introduced.

**For next sprint:** the ranked Phase B blockers (service planning, mobile UX, recurring giving, migration tooling, provider breadth) remain the priority list; scheduling a real pilot church or an uncoached evaluator session remains the single highest-impact next step for Phase D, and requires no code.
