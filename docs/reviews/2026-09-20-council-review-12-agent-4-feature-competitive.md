# Council Review 12 — Agent 4: Feature Completeness & Competitive Gap Analysis

**Date:** 2026-09-20
**Scope:** Whole-app audit (read-only), per `improve-software.md` §2 Phase 1 prompt, verbatim.

---

## 1. Workflow Completion by Module

Member Care 85%, Volunteer Scheduling 80%, CCM 85%, Events & Registrations 75%, Giving & Finances 80%, Communications 75% (explicitly notes: *"communication_dlq (as of 2026-09-20); webhook retry exhaustion now observable"*), AI Governance 60%, Project HQ 70%. **Weighted average: 76%**, unchanged from Reviews 9/10.

## 2. User Role Coverage

Super-Admin 95%, Church-Admin 95%, Pastor 85%, Secretary 60%, Ministry-Leader 70%, Volunteer 75%, Member 75%, Teacher (CCM) 50% — consistent with prior rounds.

## 3. Core Operations Workflows

Explicitly confirms this session's DLQ work: *"`lib/communications/retry-eligible.ts` implements MAX_RETRY_COUNT=3 with `moveToDeadLetterQueue()` → `communication_dlq` upsert — dead-letter visibility now exists. ✅"*

**Claim requiring correction**: this report states *"no unit tests for `parseCsv`, `parseXlsx`, `parsePlainText`, `detectFormat` in `lib/finance-import.ts` despite test file existing... but not the four format-detection parsers flagged in Council Review 10."* **This is false as of this branch** — verified directly during synthesis: `lib/finance-import.test.ts` has 27 passing tests including dedicated `describe` blocks for all four named functions, added earlier in this same session. This agent appears to have repeated Council Review 10's finding without checking the current file content on this branch. See synthesis for the correction — this is the third instance this session of an agent restating a stale finding as current without verification (see `feedback_council_synthesis_scrutiny.md`).

Also flags (independently, not previously tracked as a Council finding): `audit_log` "lacks church_id/actor_role columns" — **also incorrect**, contradicted by Agent 1's direct read of migration 20260607030000, which added both columns. Two stale/wrong claims from this agent in one report — treat its unverified factual assertions with extra skepticism relative to the other three agents this round.

## 4. Competitive Gaps vs. Planning Center / Breeze / Tithe.ly

Unchanged ranking from Reviews 9–11: (1) Service Planning Depth, (2) Phone-First Mobile UX, (3) Recurring Giving & Donor Statements, (4) Migration/Import Tooling Maturity, (5) Provider Integration Breadth. Fourth consecutive round converging on the same five gaps in the same order.

## 5. MVP Readiness Score: 65/100

Unchanged for the fourth consecutive round. Phase A GO; Phase B–D NO-GO. Binding constraint restated plainly: *"The binding constraint on Phase B/C/D is not more internal audits — it's external validation."*

## 6–7. Tests Needed / Open Questions

Recommends finance-import parser tests (already done on this branch, see correction above) and DLQ insertion/conflict tests (also already done on this branch — 3 dedicated tests in `retry-eligible.test.ts`, not visible to this agent since it didn't check the actual test file content for this specific gap either). Open questions about service-planning timeline and pilot recruitment are product decisions, not audit findings — forwarded to synthesis for visibility, not resolved here.
