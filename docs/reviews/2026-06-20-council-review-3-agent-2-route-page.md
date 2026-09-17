# Council Agent 2: Route & Page Audit — ChurchCore Operations

**Date:** 2026-06-20  
**Auditor:** Agent 2 — Routes & Navigation  
**Status:** Complete  

---

## 1. Shell Navigation Inventories

We audited navigation routes within:
- **`components/application/app-shell.tsx`**: Dynamic nav items passed via `navItems` prop, plus default system links:
  - `/app/[role]` (Default role home, resolved via `session.homePath`)
  - `/app/calendar` (Calendar home, resolved via `calendarHref`)
  - `/hq` (Project HQ Dashboard link for authorized users)
- **`components/application/member-bottom-nav.tsx`**:
  - `/app/member` (Home)
  - `/app/calendar` (Calendar)
  - `/app/member/groups` (Groups)
  - `/app/member/schedule` (Volunteer Schedule)
  - `/app/member/family` (Family profile)

---

## 2. Page Existence Check

Every key navigation route was mapped to its corresponding Next.js page in `app/`:

| Route | Shell | Page Status | Notes |
|---|---|---|---|
| `/app/member` | Member Nav | EXISTS | `/app/member/page.tsx` renders member portal |
| `/app/calendar` | Both | EXISTS | `/app/calendar/page.tsx` renders calendar live board |
| `/app/member/groups` | Member Nav | EXISTS | `/app/member/groups/page.tsx` renders groups browser |
| `/app/member/schedule` | Member Nav | EXISTS | `/app/member/schedule/page.tsx` renders volunteer schedule |
| `/app/member/family` | Member Nav | EXISTS | `/app/member/family/page.tsx` renders family edit forms |
| `/hq` | App Shell | EXISTS | `/app/hq/page.tsx` renders AI institutional dashboard |
| `/app/church-admin/people/import` | App Shell | EXISTS | Imports CSV directory lists |
| `/app/church-admin/finance/import` | App Shell | EXISTS | Imports giving & ledger items |

---

## 3. Link Consistency

- Hardcoded paths to profile routes are properly scoped under `/app/member/` or `/app/church-admin/`.
- System action buttons (like sign out buttons) reference server actions directly (`signOutAction`), preventing dead redirect anchors.
- All dynamic routes are parameterized correctly to prevent routing errors.
