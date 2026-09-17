# Council Review Synthesis: Database Retention & Session Warning Hardening — Sprint 2

**Date:** 2026-06-20  
**Review ID:** Council Review 3  
**Status:** Complete  

---

## 1. Cross-Agent Consensus

The 4 council agents identified the following key areas of security compliance, session UX, and data minimization that need hardening:
* **Audit Log Storage Pruning (ADR 0012)**: While the read-auditing system successfully logs `READ_PASTORAL` audit records to prevent unauthorized database snooping, this table will experience rapid growth. A database-level pruning routine must prune log entries older than 365 days to maintain compliance with GDPR and avoid database storage exhaustion.
* **Session Warning Prompts**: The 15-minute inactivity session wrapper is fully functional, but logging the user out abruptly creates friction. A 1-minute visual pre-logout modal warning (at 14 minutes of idle time) is required to allow active operators to extend their sessions.

---

## 2. ADR Mapping

* **ADR 0012: Audit Log Retention Policy and Pruning Schedule** has been drafted and accepted. It documents database-level automated pruning routines and audit record data minimization criteria.
  - File: [0012-audit-log-retention-and-pruning.md](file:///Users/rjulia/ChurchCore/docs/adr/0012-audit-log-retention-and-pruning.md)

---

## 3. Implementation Prompts

### Prompt A — Audit Log Retention Policy & Automatic Pruning

**ADR Reference:** ADR-0012  
**Files:** `supabase/migrations/20260714020000_audit_log_retention.sql`, `lib/actions/audit.ts`  
**Scope:** Create a database-level function `public.prune_audit_logs(retention_days integer)` that deletes log records older than the retention period, and wire up tests.  

**Work:**
1. Create migration file `20260714020000_audit_log_retention.sql`.
2. Define a database helper function `public.prune_audit_logs(retention_days integer = 365)` that executes:
   ```sql
   DELETE FROM public.audit_log WHERE created_at < now() - (retention_days || ' days')::interval;
   ```
3. Expose a secure Postgres function or procedure to trigger this pruning run.
4. Create database/integration tests verifying that executing the prune routine correctly deletes expired log records while retaining recent entries.

**Verification:**
- `npm run setup:local`
- Verification unit tests asserting that executing the pruning procedure cleans up rows older than 365 days.

---

### Prompt B — Client-Side Pre-logout Session Warning

**ADR Reference:** N/A  
**Files:** `components/application/session-timeout-wrapper.tsx`  
**Scope:** Update the inactivity timer component to show a Mantine warning modal 1 minute before the logout triggers, allowing users to extend their session.  

**Work:**
1. Update `SessionTimeoutWrapper` local state to track warning state.
2. Set up a warning timeout at **14 minutes** of inactivity (840,000 ms).
3. If warning timeout fires, render a Mantine `Modal` asking: *"Are you still there? Your session is about to expire due to inactivity."* with an "Extend Session" button.
4. Clicking the extend button resets both timers and resumes tracking.
5. If the user does not respond and the 15-minute threshold is crossed, log out and redirect to `/sign-in` as usual.

**Verification:**
- `npm run test`
- `npm run lint`
- `npm run build`

---

## 4. Execution Order

1. **Prompt A** (High priority; prevents database storage bloating and ensures compliance).
2. **Prompt B** (Medium priority; improves administrative session UX).
