# Council Review Synthesis: Core Challenges & Next Actions — Sprint 3 Planning

**Date:** 2026-06-21  
**Review ID:** Council Review 5  
**Status:** Complete  

---

## 1. Cross-Agent Consensus

The 4 council agents reviewed the current codebase and reached consensus on the following priority points:

1. **Diagnostic Pool Saturation (Agent 1 & Agent 3)**:
   - The `/api/control/db-health` route queries active postgres connections directly. If the database connection pool is exhausted, the endpoint itself will hang and fail. We need to implement a query timeout on diagnostic queries and cache health metrics in memory to prevent adding overhead during connection spikes.
2. **Mobile Nav Dead-ends & Layout Refactoring (Agent 2 & Agent 3)**:
   - Mobile bottom navigation includes directory and schedules, but sub-pages (like `/app/member/directory` or `/app/member/data-rights`) can lead to navigation dead-ends. Navigation active states in the sidebar are manual, whereas bottom nav active states are dynamic. We need to unify layout navigation states using `usePathname()`.
3. **Theological Attribution & AI Print Posture (Agent 3 & Agent 4)**:
   - AI-generated responses (sermons, Q&As) display disclaimers during the session, but copied text or printed page layouts lose the theological warning badge. We must enforce persistent disclaimer headers/footers in text payloads and CSS print stylesheets.
4. **Volunteer Burnout Overrides Auditing (Agent 1 & Agent 4)**:
   - When sessional scheduling limits (burnout warnings) are overridden by schedulers, no audit trace is written to `public.audit_log`. To protect volunteers, override events must be logged as high-sensitivity operations actions.

---

## 2. ADR Drafts

The council recommends adopting the following ADRs:
- [ADR 0013: Diagnostic Query Timeout and Caching](file:///Users/rjulia/ChurchCore/docs/adr/0013-diagnostic-query-timeout-and-caching.md)
- [ADR 0014: Persistent AI Attribution and Print Styles](file:///Users/rjulia/ChurchCore/docs/adr/0014-persistent-ai-attribution-and-print-styles.md)

---

## 3. Implementation Prompts for next Factory Run

### Prompt A — Unifying App Shell Active Navigation

**ADR Reference:** N/A  
**Files:** `components/application/app-shell.tsx`  
**Scope:** Refactor sidebar navigation to automatically determine the active NavLink by checking `usePathname()` instead of relying on manual `active` state flags injected by parent pages.  

**Work:**
1. Import `usePathname` from `next/navigation` in `app-shell.tsx`.
2. Implement a path checker function within the client component (similar to `isActive` in `member-bottom-nav.tsx`).
3. Update NavLink mapping to call the check function automatically against `item.href` and `item.includes`.

**Verification:**
- Vitest unit tests asserting sidebar links resolve correct active state highlights dynamically based on mock router pathnames.

---

### Prompt B — Diagnostic Endpoint Protection & Caching

**ADR Reference:** ADR 0013  
**Files:** `app/api/control/db-health/route.ts`  
**Scope:** Add a database query timeout and memory cache helper to the DB health diagnostic endpoint.  

**Work:**
1. Configure postgres query settings (e.g. `statement_timeout = 2000`) before running `pg_stat_activity` query, or pass a timeout signal to connection clients.
2. Store the connection count status in an in-memory cache variable with a 10-second TTL.
3. Serve subsequent requests from cache instead of querying database if TTL is active.

**Verification:**
- Unit tests mocking DB connection timeout and verifying the endpoint returns a fast failure (500) within 2 seconds.
- Unit tests verifying subsequent calls retrieve cached connection counts.

---

### Prompt C — Persistent AI Disclaimers in Print & Copy Layouts

**ADR Reference:** ADR 0014  
**Files:** `lib/ai-ministry/client.ts`, `app/app/pastor/bible-study/page.tsx` (and other AI pages)  
**Scope:** Enforce theological warning footers in return payloads and print styles.  

**Work:**
1. Ensure Claude outline generators append the disclaimer text string directly to the response body string.
2. In CSS stylesheets, add a print media query wrapping the AI outline:
   ```css
   @media print {
     .ai-disclaimer-badge {
       display: block !important;
       position: running(footer);
     }
   }
   ```

**Verification:**
- Unit tests asserting text responses include disclaimer copy.
- Visual inspection of the print layout.

---

## 4. Execution Order

1. **Prompt A** (UI Refactor) - Independent.
2. **Prompt B** (Endpoint Caching) - Independent.
3. **Prompt C** (AI Disclaimers) - Dependent on Prompt templates.

All prompts can be run in parallel.
