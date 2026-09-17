# Council Review Synthesis: Core Challenges & Next Actions — Council Review 6

**Date:** 2026-06-21  
**Review ID:** Council Review 6  
**Status:** Complete  

---

## 1. Cross-Agent Consensus

The 4 council agents reviewed the current codebase and reached consensus on the following priority points:

1. **Communications Query Typo (Agent 1, Agent 2 & Agent 4):**
   - The recipient resolver `recipient-resolver.ts` queries `attendance_records`, which does not exist in the database schema. It must query the standard `attendance` table to prevent runtime crashes during communications list resolution.
2. **Static Schema Validation (Agent 1 & Agent 4):**
   - The schema check tool `check-schema-alignment.mjs` fails due to unrecognized database views (`member_directory`, `discipleship_velocity`, `burnout_category_counts`) and control plane tables (`demo_feedback`). The script needs to be refactored to parse Postgres view creation SQL statements.
3. **Burnout Bypass Auditing (Agent 3 & Agent 4):**
   - Scheduling volunteers in violation of rest guidelines (burnout alerts) can be bypassed by ministry leaders, but these bypass overrides are not audited. We must log overrides to `public.audit_log` as high-sensitivity operations events to ensure volunteer care standards.

---

## 2. ADR Drafts

The council recommends adopting the following ADR:
- [ADR 0015: Schema View Verification, Communications Query Alignment, and Burnout Audit Logging](file:///Users/rjulia/ChurchCore/docs/adr/0015-schema-view-verification-and-recipient-resolver-alignment.md)

---

## 3. Implementation Prompts for next Factory Run

### Prompt A — Standardizing recipient-resolver Query Target

**ADR Reference:** ADR 0015  
**Files:** `lib/communications/recipient-resolver.ts`  
**Scope:** Re-route database selects from the non-existent `attendance_records` table to the canonical `attendance` table.  

**Work:**
1. Open [recipient-resolver.ts](file:///Users/rjulia/ChurchCore/lib/communications/recipient-resolver.ts).
2. Change `.from("attendance_records")` to `.from("attendance")`.
3. Verify that all filter columns (`profile_id`, `checked_in_at`, `church_id`) are compatible with the columns defined in the `attendance` table.
4. Run `npm run test` to verify test suites compile and pass successfully.

**Verification:**
- Run `npm run test` and check that all recipient resolver tests pass.

---

### Prompt B — Refactoring the Schema Alignment Tool

**ADR Reference:** ADR 0015  
**Files:** `scripts/check-schema-alignment.mjs`  
**Scope:** Update the schema alignment script to recognize SQL view declarations and ignore control plane tables.  

**Work:**
1. Open [check-schema-alignment.mjs](file:///Users/rjulia/ChurchCore/scripts/check-schema-alignment.mjs).
2. Add a parser matching `create or replace view` SQL patterns inside migrations:
   ```javascript
   const viewMatches = content.matchAll(
     /create\s+(?:or\s+replace\s+)?view\s+(?:public\.)?(\w+)/gi
   );
   ```
3. Register matched view names into the `migrationTables` set so they are recognized.
4. Add a list of ignored tables (e.g. `['demo_feedback']`) to prevent false phantom alerts on control plane tables.
5. Verify the schema alignment check passes: `npm run check:schema`.

**Verification:**
- Execute `npm run check:schema` and check for exit code 0.

---

### Prompt C — Auditing Volunteer Burnout Warning Overrides

**ADR Reference:** ADR 0015  
**Files:** `app/app/volunteer-actions.ts`  
**Scope:** Record an audit log event whenever a volunteer burnout warning is bypassed by a scheduler.  

**Work:**
1. Open volunteer actions and locate scheduling trigger operations.
2. If a volunteer assignment violates shift limit guidelines and the leader explicitly overrides the warning, trigger `logAuditEvent`:
   - Set action to `"OVERRIDE_VOLUNTEER_BURNOUT"`.
   - Log target profile ID, overridden guideline info, and user justification to the audit metadata.
3. Add unit test coverage verifying that override events call the auditing database routines.

**Verification:**
- Run `npm run test` to check validation.

---

## 4. Execution Order

1. **Prompt A** (Fix resolver query) - Independent.
2. **Prompt B** (Refactor schema alignment) - Independent.
3. **Prompt C** (Audit volunteer burnout) - Independent.

All prompts can be run in parallel.
