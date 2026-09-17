# Council Agent 2: Route & Page Audit — ChurchCore Challenge

**Date:** 2026-06-21  
**Auditor:** Agent 2 — Route & Page Coverage  
**Status:** Complete  

---

## 1. Shell Navigation Inventories

We audited the three navigation controllers:
1. **`app-shell.tsx`**: Dynamic sidebar driven by `navItems`, along with global links for `Workspace` and `Calendar` (if calendarHref is enabled).
2. **`member-bottom-nav.tsx`**: A mobile bottom bar linking to:
   - `/app/member` (Home)
   - `/app/calendar` (Calendar)
   - `/app/member/family` (Family)
   - `/app/member/groups` (Groups)
   - `/app/member/schedule` (Schedule)
3. **`reports-shell.tsx`**: Tabbed layout linking to:
   - `/app/reports` (Overview)
   - `/app/reports/members` (Members)
   - `/app/reports/events` (Events)
   - `/app/reports/giving` (Giving)

---

## 2. Route & Page Mapping Challenge

We verified the status of all navigation endpoints:

| Route | Shell | Page Status | Notes |
| --- | --- | --- | --- |
| `/app/member` | Bottom Nav | **EXISTS** | Dashboard for member announcements and activities. |
| `/app/calendar` | Sidebar & Bottom Nav | **EXISTS** | Live categorized calendar interface. |
| `/app/member/family` | Bottom Nav | **EXISTS** | Household profiles management. |
| `/app/member/groups` | Bottom Nav | **EXISTS** | Roster of assigned small groups. |
| `/app/member/schedule` | Bottom Nav | **EXISTS** | Member volunteer shift coordination. |
| `/app/member/data-rights` | Sub-page | **EXISTS** | GDPR self-service data deletion/export. |
| `/app/reports` | Reports Shell | **EXISTS** | Stewardship reports overview. |
| `/app/reports/members` | Reports Shell | **EXISTS** | Demographics and member retention graph. |
| `/app/reports/events` | Reports Shell | **EXISTS** | Attendance trend reporting. |
| `/app/reports/giving` | Reports Shell | **EXISTS** | Fund distribution report. |
| `/control` | Platform Shell | **EXISTS** | SuperAdmin system dashboard. |
| `/control/demo-feedback` | Platform Shell | **EXISTS** | Triage board for platform feedback. |
| `/controll` | N/A | **REDIRECT STUB** | Backward-compatibility redirect to `/control`. |

### Challenging the Routing Layout:
- **Redirection Overhead**: `/controll` is hardcoded as a physical path in the build output. While useful for mistyped URLs, it should be handled via a lightweight server redirect in `next.config.ts` or middleware instead of rendering an unnecessary page route bundle.
- **Client Route Discrepancies**: In `member-bottom-nav.tsx`, sub-pages like `/app/member/directory` and `/app/member/ministries` are grouped under the Home bottom nav segment but lack dedicated bottom nav icons or quick tabs, which can cause navigation dead-ends on mobile screens.
- **Unauthorized Actions Exposure**: Import wizard components (e.g. `finance-import-wizard`) are client components loaded dynamically. While the actions are server-gated, the UI layouts remain visible in JS bundles even to unauthorized roles if bundling is not carefully split.

---

## 3. Top 3 Route/Page Challenges

1. **Eliminate Vestigial Redirect Routes**: Migrate `/controll` to a standard middleware redirect.
2. **Unify Mobile Directory Access**: Ensure the Member directory and Ministries lists are accessible through explicit mobile routes rather than nested deep within dashboard cards.
3. **Optimized Bundle Separation**: Ensure that administrative import wizards and control plane sub-pages are dynamically imported or code-split to prevent shipping heavy CSV parsing and admin logic to normal member clients.
