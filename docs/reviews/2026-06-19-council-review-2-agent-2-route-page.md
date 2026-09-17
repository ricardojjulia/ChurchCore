# Council Agent 2: Route & Page Authorization Audit — ChurchCore LMS

**Date:** 2026-06-19
**Auditor:** Agent 2 — Route & Page Security
**Status:** Complete

---

## 1. Page-Level Auth Gates

All pages under the authenticated paths `/app/` and `/portal/` are protected by layout or action-level session gates:

* **Page Gating**: The entry pages check user authentication status and redirect to `/sign-in` if the session is absent.
* **Role Redirection**: `/workspace/page.tsx` checks user roles and routes them to home paths like `/app/church-admin`, `/app/pastor`, or `/app/member`.
* **Mantine UI Gating**: Dashboard pages (e.g. `/hq`) conditionally render access-denied UI boundaries (using locked card overlays) if the user's mapped role does not satisfy authorization requirements (e.g. standard member blocked from HQ).

---

## 2. Server Action Role Gates

The backend relies on Next.js Server Actions under `app/app/*.ts` for state mutations. These actions implement robust security wrappers:

* **Session Validation**: Action triggers call `requireChurchSession(redirectPath)`.
* **Explicit Role Enforcement**:
  - Administrative actions (in `church-admin-actions.ts`) assert `requireChurchAdminSession(redirectPath)`.
  - Pastoral actions (in `elders-actions.ts` / `actions.ts`) assert `requirePastorProfileContext(redirectPath)`.
  - Ministry leaders (in `volunteer-actions.ts`) are validated via `can_manage_church` or session-specific limits.
* **Owner Boundaries**: Actions verifying self-updates (e.g. `member-actions.ts`) assert that `targetProfileId` matches the authenticated `session.userId`, preventing users from submitting profile updates for other members.

---

## 3. Route Security Gaps

* **Lack of Global Middleware Routing**: ChurchCore does not implement a Next.js `middleware.ts` file to intercept page requests globally. Instead, authorization checks are executed at the layout/page render time or action invoker time. This leaves a minor risk where static layouts or assets might be rendered briefly before client-side redirection completes.
* **Orphaned Page Folder**: The directory `app/controll/` remains in the codebase as a phantom route. Although it is a stub, it represents dead code that should be purged to prevent confusion or security scans.

---

## 4. Top 3 Route & Page Gaps for MVP

1. **Global Router Middleware**: Implement a central `middleware.ts` checking session validation and role paths at the Next.js edge router layer.
2. **Purge Stub Folder**: Delete `app/controll/` directory.
3. **Session Revalidation**: Force client-side router refreshes on layout focus to catch token expiration immediately.
