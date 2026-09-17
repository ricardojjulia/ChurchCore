# Council Review 9 — Agent 2: Route & Page Audit

**Date:** 2026-09-17 · **Branch:** feat/council-2-8-and-project-hq · **Read-only audit**

## Shell Navigation Inventory

- **app-shell.tsx**: `workspaceHref`, `calendarHref` (dynamic)
- **member-bottom-nav.tsx**: `/app/member`, `/app/calendar`, `/app/member/family`, `/app/member/groups`, `/app/member/schedule`, plus `/app/member/directory`, `/app/member/ministries`, `/app/member/data-rights`
- **reports-shell.tsx**: `/app/reports`, `/app/reports/members`, `/app/reports/events`, `/app/reports/giving`, `/app/reports/custom`, `/app/calendar`, `/app/church-admin` (admin), `/app/pastor` (non-admin)

## Page Status

23 pages audited; 1 intentional stub (`/app` → redirect to `session.homePath`); 0 missing; 0 orphaned API handlers; 0 broken hardcoded hrefs.

| Route | Status | Notes |
|---|---|---|
| `/app/[role]` | EXISTS | Server-side RBAC enforced |
| `/app/reports/custom` | EXISTS | RBAC: pastor/church-admin only, enforced at both page and API handler |
| `/app/hq` | **CRITICAL at audit time** | Client-side-only RBAC; no server-side gate; a member-role or logged-out request could reach the dashboard shell |
| `/app/church-admin/onboarding` | EXISTS | Correct server-side RBAC, redirects non-admins |
| `/app/portal/volunteer/confirm/[token]` | EXISTS | Correctly public, token-based, no session required |
| `/app/portal/volunteer/schedule/[token]` | EXISTS | Same |

## Critical Finding: `/app/hq` RBAC

`app/hq/page.tsx` is a 1289-line client component that resolves role via a `current_user_role()` RPC inside a `useEffect`. Because `hq_tasks`/`hq_risks`/`hq_decisions`/`hq_sessions` are RLS-scoped to the same RPC, the underlying **data** was never exposed — but the dashboard **shell** rendered for any authenticated request regardless of role, and would render for logged-out or member-role users until the client-side check resolved.

**Resolution:** `app/hq/layout.tsx` added (commit `268b915`) — a server component that resolves the session and the same `current_user_role()` RPC before the client page mounts, redirecting to `/sign-in` (no session) or `/app` (member role, or RPC error). 4 new tests in `app/hq/layout.test.tsx`.

## Strengths

- `/app/church-admin/onboarding` and `/app/app/[role]/page.tsx` are the reference pattern for server-side RBAC gating other pages should follow.
- `/api/reports/custom` enforces RBAC at the handler level, not just the page.
- Public portal token routes correctly bypass session requirements without exposing member PII.
