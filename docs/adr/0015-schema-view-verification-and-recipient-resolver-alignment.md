# ADR 0015: Schema View Verification, Communications Query Alignment, and Burnout Audit Logging

* **Status:** Proposed  
* **Date:** 2026-06-21  
* **Authors:** Antigravity (Gemini Software Factory)  
* **Decisions:** [2026-06-21-council-review-6-synthesis.md](file:///Users/rjulia/ChurchCore/docs/reviews/2026-06-21-council-review-6-synthesis.md)  

---

## Context and Problem Statement

During the Council Review 6 audit and schema verification checks (`npm run check:schema`), several critical issues and schema alignment anomalies were identified:
1. **Communications Query Typo:** The recipient resolution script `recipient-resolver.ts` queries a non-existent `attendance_records` table when resolving audience lists filtered by attendance window (`attendedWithinDays`). The actual migration schema defines the table name as `attendance`. Since tests mock database query targets dynamically, this runtime bug was not caught by test assertions.
2. **Static Schema Alignment Limitations:** The static schema checker `check-schema-alignment.mjs` maps code table references to SQL migration declarations by looking for `create table` matches. It misses Postgres Views (`create or replace view`), throwing false-positive warnings for active database views (`member_directory`, `discipleship_velocity`, `burnout_category_counts`). It also errors on control plane tables like `demo_feedback` which are isolated from tenant schema catalogs.
3. **Volunteer Burnout Guideline Auditing Gaps:** The volunteer scheduling module implements burnout guardrails that warn schedulers when volunteers are assigned consecutive shifts or are overloaded. However, when these warning guardrails are overridden, the action is not audited in `public.audit_log`. To protect volunteers and ensure care alignment, overrides must be tracked as high-sensitivity operations logs.

---

## Decision Drivers

* **Reliability and Test Safety:** Standardize database query targets and ensure tests do not hide missing schema objects.
* **Tooling Integrity:** Update check scripts to properly recognize legitimate database views and isolate control plane dependencies.
* **Theological Care & Volunteer Protection:** Record auditable evidence whenever scheduling rest guidelines are bypassed.

---

## Proposed Decisions

### 1. Re-route Communications Recipient Queries
Refactor `lib/communications/recipient-resolver.ts` to query the `attendance` table directly instead of `attendance_records`. Ensure query columns (`profile_id`, `checked_in_at`, `church_id`) align with the `attendance` table fields.

### 2. Update the Static Schema Verification Checker
Modify `scripts/check-schema-alignment.mjs` to:
- Parse `create or replace view` definitions in migrations, registering views alongside tables to eliminate false-positive phantom alerts.
- Ignore control-plane tables (such as `demo_feedback`) that are intentionally dropped from tenant schema runs.

### 3. Log Audit Traces for Volunteer Burnout Overrides
Inject audit logging blocks calling `logAuditEvent` inside volunteer scheduling actions (`app/app/volunteer-actions.ts` or related services) whenever a scheduler bypasses load warnings or rest constraints. Record the operator ID, target volunteer profile, overridden guidelines, and contextual justification.

---

## Consequences

* **Positive:**
  - Prevents database runtime crashes on communications campaigns filtering by attendance ranges.
  - Returns `check:schema` checks to a clean passing state, reinforcing build pipeline sanity.
  - Ensures full operational accountability for sessional volunteer burnout guardrail overrides.
* **Negative:**
  - Schema alignment scripts will require manual upkeep if new SQL view creation syntaxes are added.
