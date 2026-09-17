# Council Agent 2: Route & Page Audit — Council Review 6

**Date:** 2026-06-21  
**Auditor:** Agent 2 — Route & Page Coverage  
**Status:** Complete  

---

## 1. Shell Navigation Inventories

We audited all core client shells:
- **`app-shell.tsx`:** Coordinates sidebar links based on active portal context (`church-admin`, `pastor`, etc.), now dynamically highlighting selection status using `usePathname()`.
- **`member-bottom-nav.tsx`:** Bottom tab bar for mobile member portals. Exposes:
  - `/app/member` (Home)
  - `/app/calendar` (Calendar)
  - `/app/member/family` (Family)
  - `/app/member/groups` (Groups)
  - `/app/member/schedule` (Schedule)
- **`reports-shell.tsx`:** Reports management links:
  - `/app/reports` (Overview)
  - `/app/reports/members` (Members)
  - `/app/reports/events` (Events)
  - `/app/reports/giving` (Giving)

---

## 2. Route Verification Summary

We verified that every route declared in navigation controllers points to an active Next.js page segment:

| Route | Shell | Page Status | Notes |
| --- | --- | --- | --- |
| `/app/member` | Bottom Nav | **EXISTS** | Active home dashboard. |
| `/app/calendar` | Sidebar & Bottom Nav | **EXISTS** | Live event calendars. |
| `/app/member/family` | Bottom Nav | **EXISTS** | Family directory editor. |
| `/app/member/groups` | Bottom Nav | **EXISTS** | Small groups rosters list. |
| `/app/member/schedule` | Bottom Nav | **EXISTS** | Volunteer shifts view. |
| `/app/member/data-rights` | Sub-page | **EXISTS** | Data erasure/GDPR requests workspace. |
| `/app/member/directory` | Sub-page | **EXISTS** | Member directory list. |
| `/app/member/ministries` | Sub-page | **EXISTS** | Ministries registration list. |
| `/app/reports` | Reports Shell | **EXISTS** | Reporting home view. |
| `/app/reports/members` | Reports Shell | **EXISTS** | Member demographics charts. |
| `/app/reports/events` | Reports Shell | **EXISTS** | Attendance trend charts. |
| `/app/reports/giving` | Reports Shell | **EXISTS** | Stewardship reports charts. |
| `/control` | Platform Shell | **EXISTS** | Platform control dashboard. |
| `/control/demo-feedback` | Platform Shell | **EXISTS** | Feedback triaging board. |
| `/control/launch-checklist` | Platform Shell | **EXISTS** | System launch verification checklist. |
| `/controll` | Typo redirect | **STUB** | Page route containing a hardcoded client redirect to `/control`. |

---

## 3. Link Consistency & Orphaned Handlers

- **`attendance_records` Typo:** In [recipient-resolver.ts](file:///Users/rjulia/ChurchCore/lib/communications/recipient-resolver.ts), querying `attendance_records` results in a runtime error because the actual table name is `attendance`. This represents a critical orphaned handler path.
- **Typo Page Bundles:** The presence of `/controll` as a route directory causes unnecessary static bundling overhead. It should be removed from the pages directory and registered as a configuration redirect rule.

---

## 4. Top 3 Route & Page Gaps

1. **Fix `attendance_records` Query Target:** Ensure the communication recipient resolver targets the real `attendance` table.
2. **Convert `/controll` to configuration redirects:** Eliminate the physical page directory.
3. **Clean Route Splits:** Ensure heavy CSV-handling components are isolated from standard member JS bundles to optimize mobile performance.
