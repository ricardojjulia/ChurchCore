# Council Agent 2: Route & Page Audit — ChurchCore LMS

**Date:** 2026-06-18
**Auditor:** Agent 2 — Route & Page Audit
**Status:** Complete

---

## 1. Shell Navigation Inventories

Three main layouts manage the navigation footprint:

1. **Staff App Shell** (`components/application/app-shell.tsx`):
   * Dynamic navigation items loaded per active admin/pastor view:
     * `Home` (`session.homePath`)
     * `Calendar` (`/app/calendar`)
     * `Project HQ` (`/hq`)
     * Sub-features like `People` (`/app/church-admin/people`), `Events` (`/app/church-admin/events`), etc.
2. **Member Bottom Nav** (`components/application/member-bottom-nav.tsx`):
   * Fixed links for mobile users:
     * Home: `/app/member` (includes subpaths `/directory`, `/ministries`, `/data-rights`)
     * Calendar: `/app/calendar`
     * Family: `/app/member/family`
     * Groups: `/app/member/groups`
     * Schedule: `/app/member/schedule`
3. **Reports Shell** (`components/application/reports-shell.tsx`):
   * Focuses on analytical summaries under `/app/reports/`.

---

## 2. Page Existence Check

All main navigation links resolved to actual page files:

| Route | Shell | Page Status | Notes |
|---|---|---|---|
| `/app/member` | Member | EXISTS | Resolves to `app/app/member/page.tsx` |
| `/app/calendar` | Both | EXISTS | Resolves to `app/app/calendar/page.tsx` |
| `/app/member/family` | Member | EXISTS | Resolves to `app/app/member/family/page.tsx` |
| `/app/member/groups` | Member | EXISTS | Resolves to `app/app/member/groups/page.tsx` |
| `/app/member/schedule`| Member | EXISTS | Resolves to `app/app/member/schedule/page.tsx` |
| `/hq` | Staff | EXISTS | Resolves to `app/hq/page.tsx` |
| `/app/church-admin/people`| Staff | EXISTS | Resolves to `app/app/church-admin/people/page.tsx` |
| `/app/church-admin/giving` | Staff | EXISTS | Resolves to `app/app/church-admin/giving/page.tsx` |
| `/app/controll` | N/A | STUB / REDIRECT | Resolves to `app/controll/page.tsx` — redirects to `/control` (typo handler) |
| `/workspace` | N/A | STUB / REDIRECT | Resolves to `app/workspace/page.tsx` — redirects to role home path |
| `/app/app` | N/A | STUB / REDIRECT | Resolves to `app/app/page.tsx` — redirects to home path |

---

## 3. API Route Completeness

For every interactive client form or button that communicates with the backend, matching endpoint handlers exist:
* The feedback system (`components/demo-feedback-workspace.tsx`) uses `POST /api/demo/feedback`.
* The AI advisor features in the HQ dashboard use `POST /api/ai`.
* The main tables (tasks, risks, decisions) write directly to Supabase client tables (`hq_tasks`, `hq_risks`, `hq_decisions`) which are protected by PostgreSQL RLS.
* *No orphaned front-end forms were identified.*

---

## 4. Link Consistency

A scan of all page files reveals that hardcoded links are correctly structured using standard relative path helpers. There are no dead links or outdated workspace pointers.

---

## 5. Critical Findings & 404/Stub Issues

* **`app/controll/page.tsx`**: Classified as a redirect stub. While useful for catching typos, it can be deleted in favor of standard Next.js wildcard routing configuration.
* **`app/workspace/page.tsx`**: Purely acts as a gateway check redirect. It should be refactored into Next.js middleware routing rules to prevent client-side double redirects.
