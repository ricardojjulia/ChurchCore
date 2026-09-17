# Council Review Synthesis: Onboarding, Imports, Custom Reports & Burnout — Council Review 8

**Date:** 2026-06-21  
**Review ID:** Council Review 8  
**Status:** Approved for Implementation  

---

## 1. Cross-Agent Consensus & Decision

The council has approved the next execution roadmap focusing on **Option B (Onboarding & Imports)**, **Option C (Stewardship & Burnout Analytics)**, and **Custom Reporting**. 

### Agreed Architecture & Boundaries:
1. **Onboarding Simulation (ADR 0017):** A client-side guided setup wizard overlay that interacts with mock/sandbox tenant data, allowing prospective church administrators to test directories and event setups without polluting production system tables.
2. **Import Header Mapping & Hardening (ADR 0018):** Expand CSV parsing limits, add flexible custom key mapping, auto-detect encodings, and compile unmatched warnings to prevent duplicate record inserts.
3. **Ministry Vitality Scoring (ADR 0019):** An analytics routine calculating volunteer exhaustion warning states and small-group progress velocities based on schedule histories and blockout dates.
4. **Custom Report Builder (ADR 0020):** A secure database query engine for compiling custom CSV/PDF reports across giving, members, and event headcounts with row-level tenant security.

---

## 2. User Stories & Acceptance Criteria

### Story 1: Sandbox Guided Onboarding Wizard
* **User Story:** As a prospective church administrator, I want a guided onboarding tour with pre-hydrated demo metrics so that I can explore the platform's features without setup overhead.
* **Acceptance Criteria:**
  * Displays checklist steps (Setup, Add Member, Create Event) with completion markers.
  * Sandbox database initialization matches standard tenant boundaries.
  * Non-admins (members, guests) are redirected away from the wizard.

### Story 2: Hardened Import Header Mapper
* **User Story:** As a migrating church admin, I want to map unmatched CSV column headers to the directory model so that I can import data from Planning Center/Breeze easily.
* **Acceptance Criteria:**
  * Rejects files over 5MB and files with invalid formatting.
  * Allows interactive dropdown mapping of CSV headers to profiles/giving schemas.
  * Generates warning reviews detailing duplicate rows and missing fields.

### Story 3: Ministry Vitality & Burnout Alerts
* **User Story:** As a ministry coordinator, I want alerts when volunteers are scheduled for too many consecutive services so that I can prevent volunteer burnout.
* **Acceptance Criteria:**
  * Calculates volunteer shifts over a rolling 4-week window.
  * Triggers warnings if a member is assigned more than 3 shifts per month.
  * Logs scheduler override decisions inside the `logAuditEvent` logs.

### Story 4: Custom Report Generator
* **User Story:** As a church treasurer, I want to build custom filters for giving and attendance records so that I can reconcile budgets and check membership rates.
* **Acceptance Criteria:**
  * Restricts query parameters strictly to the current `church_id`.
  * Exports formatted data cleanly to CSV/PDF.
  * All export events are logged in the audit trail under `"EXPORT_REPORT"`.

---

## 3. ADR References
* [ADR 0017: Multi-Tenant Sandbox Onboarding and Demo Simulation](file:///Users/rjulia/ChurchCore/docs/adr/0017-sandbox-onboarding-simulation.md)
* [ADR 0018: Incumbent Import Schema Mapping and Hardening](file:///Users/rjulia/ChurchCore/docs/adr/0018-import-adapter-hardening.md)
* [ADR 0019: Volunteer Burnout Analytics and Ministry Vitality Scoring](file:///Users/rjulia/ChurchCore/docs/adr/0019-burnout-vitality-scoring.md)
* [ADR 0020: Custom Dashboard Report Builder and General Ledger Exports](file:///Users/rjulia/ChurchCore/docs/adr/0020-custom-reporting-ledger-export.md)

---

## 4. Implementation Prompts for the Code Factory

### Prompt A — Sandbox Onboarding & Simulator
* **Task:** Create the sandbox client onboarding overlay.
* **Files:** `app/app/church-admin/onboarding/page.tsx`, `components/onboarding/guided-tour.tsx`
* **Work:** Build a stateful guided wizard component using Mantine. If a tenant is in "sandbox mode," hydrate mock events and directories. Block access for non-admin accounts.

### Prompt B — Hardened CSV Mapping Adapter
* **Task:** Build interactive header mapping and dry-run reporting for CSV imports.
* **Files:** `app/app/church-admin/people/import/page.tsx`, `lib/import-header-mapper.ts`
* **Work:** Implement file structure validation using PapaParse. Render an interactive header dropdown selector mapping CSV keys (e.g., `Cell Phone` -> `phone`). Return conflict list warnings.

### Prompt C — Burnout Scoring & Scheduler Override Logs
* **Task:** Build rolling-window burnout validation hooks and logging.
* **Files:** `lib/burnout-calculator.ts`, `app/app/volunteer-actions.ts`
* **Work:** Create calculator script matching rolling 30-day schedules. Hook validation check inside volunteer assignments. Audit any override events using `logAuditEvent`.

### Prompt D — Custom Report Query Builder
* **Task:** Implement the tenant-isolated report builder and CSV/PDF export API.
* **Files:** `app/api/reports/custom/route.ts`, `app/app/church-admin/reports/custom/page.tsx`
* **Work:** Set up filtered Postgres query runners. Enforce RLS by binding all queries to `session.churchId`. Log the action in audit records.

---

## 5. Master Plan of Execution

```
[Prompt A: Onboarding Sandbox] ──► [Prompt B: Import Header Mapper] ──► [Prompt C: Burnout Analytics] ──► [Prompt D: Custom Report Builder]
```
1. Run lint and schema verification tests after each prompt.
2. Ensure no tenant boundary leaks occur during report queries or data imports.
