# Council Agent 2 — Route & Page Audit

**Branch audited:** `fix/error-boundaries-finance-tests-member-route`

## Navigation Shell Inventory

**app-shell.tsx:** Uses dynamic `workspaceHref` & optional `calendarHref` props (no hardcoded routes).

**member-bottom-nav.tsx** (5 primary + 3 included):
- `/app/member` (home icon)
- `/app/calendar` (calendar icon)
- `/app/member/family`
- `/app/member/groups`
- `/app/member/schedule`
- Breadcrumb includes: `/app/member/directory`, `/app/member/ministries`, `/app/member/data-rights`

**reports-shell.tsx** (5 nav items + 2 system):
- `/app/reports`, `/app/reports/members`, `/app/reports/events`, `/app/reports/giving`, `/app/reports/custom`
- System: `/app/calendar`, `/app/church-admin` (conditional), `/app/pastor` (conditional)

## Page Existence Verification

| Route | Page Status | Notes |
|-------|---|---|
| `/app/member` | EXISTS | Served by dynamic `app/app/[role]/page.tsx` — confirmed by reading the file: `portalRole.id === "member"` renders `MemberPortalHome` with `getMemberPortalData()`. No literal `app/app/member/page.tsx` exists, and none is needed. |
| `/app/calendar` | EXISTS | `app/app/calendar/page.tsx` |
| `/app/member/family` | EXISTS | `app/app/member/family/page.tsx` |
| `/app/member/groups` | EXISTS | `app/app/member/groups/page.tsx` |
| `/app/member/schedule` | EXISTS | `app/app/member/schedule/page.tsx` |
| `/app/member/directory` | EXISTS | `app/app/member/directory/page.tsx` |
| `/app/member/ministries` | EXISTS | `app/app/member/ministries/page.tsx` |
| `/app/member/data-rights` | EXISTS | `app/app/member/data-rights/page.tsx` |
| `/app/reports` | EXISTS | `app/app/reports/page.tsx` |
| `/app/reports/members` | EXISTS | `app/app/reports/members/page.tsx` |
| `/app/reports/events` | EXISTS | `app/app/reports/events/page.tsx` |
| `/app/reports/giving` | EXISTS | `app/app/reports/giving/page.tsx` |
| `/app/reports/custom` | EXISTS | `app/app/reports/custom/page.tsx` |
| `/app/church-admin` | EXISTS | Served by dynamic `app/app/[role]/page.tsx` |
| `/app/pastor` | EXISTS | Served by dynamic `app/app/[role]/page.tsx` |

**Resolution of the standing `/app/member` 404 question (Council Review 11/12):** confirmed false alarm, closed. Next.js resolves a literal static segment (e.g. `app/app/member/ministries/page.tsx`) ahead of a dynamic one when both could match, but for `/app/member` itself no static `page.tsx` exists, so the dynamic `app/app/[role]/page.tsx` correctly serves it via `params.role === "member"`. This is intentional role-based portal routing, not a 404 risk, and needs no code change.

## API Route Completeness

All fetch/POST calls checked resolve to an existing route under `app/api/` (push subscribe, demo feedback, demo payment, AI, custom reports, control demo-feedback). No orphaned handlers found. Data-mutation flows mostly use server actions rather than API routes, which is consistent with the rest of the app.

## Link Consistency

No broken hardcoded hrefs found in page components. Short-lived redirects (e.g. `/app/communications` → `/app/communications/history`) are intentional routing, not stubs.

## Summary

**Result: CLEAN** — all navigation hrefs have corresponding pages (including via the dynamic `[role]` catch-all), all fetch calls have API routes, no 404s, no stubs, no orphaned handlers. The three new `error.tsx` files on this branch (`app/app/error.tsx`, `app/portal/error.tsx`, `app/control/error.tsx`) are full implementations delegating to `PageErrorBoundary`, not stubs.
