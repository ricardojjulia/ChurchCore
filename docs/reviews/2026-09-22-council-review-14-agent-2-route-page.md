# Council Review 14 — Agent 2: Routes & Pages Audit

**Branch:** `feat/service-planning-song-library` (commit `8c57631`)

## Shell Nav Inventory

`app-shell.tsx` (generic template), `member-bottom-nav.tsx` (8 hrefs), `reports-shell.tsx` (6 hrefs incl. dynamic `[role]`) — all resolve to EXISTS.

## Page Existence Check

| Category | Count | Result |
|---|---|---|
| Member nav | 8 | All EXISTS |
| Reports nav | 6 | All EXISTS |
| Volunteers (branch-scoped) | 3 pages + 3 nav links | All EXISTS |
| Hardcoded hrefs in `volunteer-schedule.tsx` | 4 | All EXISTS (readiness, `events/[id]`, `volunteers/schedules/[id]`) |

## API Route Completeness

No orphaned handlers. The volunteers pages and components use server actions (`"use server"`), not client `fetch`, so no API route is expected or missing.

## Branch-Specific: Role Gate Consistency

The three widened pages all now allow `church-admin || pastor || ministry-leader`:

- `app/app/church-admin/volunteers/page.tsx` — consistent
- `app/app/church-admin/volunteers/schedules/page.tsx` — consistent
- `app/app/church-admin/volunteers/schedules/[id]/page.tsx` — consistent

Server-side alignment confirmed: `canManageServicePlans()` in `volunteer-actions.ts` matches exactly. No other route under `app/app/church-admin/volunteers/` exists that should have been widened but wasn't — these are the only three. Other church-admin routes (visitors, people) correctly retain church-admin-only gates for their own, distinct logic — not a leftover inconsistency.

## Summary

No blockers. All routes resolve, all three role gates align with each other and with the server-action layer, no broken links introduced.
