# Security Role-Access Matrix

Date: 2026-06-02
Status: Active evidence index for competitive-readiness Finding 6.

## Purpose

This matrix records allowed roles and verification evidence for high-sensitivity operational routes and actions.

## Roles

- Control Plane Staff
- ChurchAdmin
- Secretary
- Pastor
- Ministry Leader
- Volunteer
- Member
- Public

## Matrix

| Surface | Allowed roles | Denied roles | Evidence |
| --- | --- | --- | --- |
| ChurchAdmin giving import dry-run action | ChurchAdmin | Pastor, Ministry Leader, Secretary, Member, Public | [app/app/church-admin/giving/import/actions.test.ts](app/app/church-admin/giving/import/actions.test.ts) |
| ChurchAdmin giving import commit action | ChurchAdmin | Pastor, Ministry Leader, Secretary, Member, Public | [app/app/church-admin/giving/import/actions.test.ts](app/app/church-admin/giving/import/actions.test.ts) |
| ChurchAdmin people import route (`/app/church-admin/people/import`) | ChurchAdmin | Pastor, Ministry Leader, Secretary, Member, Public | Route gate in [app/app/church-admin/people/import/page.tsx](app/app/church-admin/people/import/page.tsx) and action tests in [app/app/church-admin/people/import/actions.test.ts](app/app/church-admin/people/import/actions.test.ts) |
| People import dry-run action | ChurchAdmin | Pastor, Ministry Leader, Secretary, Member, Public | [app/app/church-admin/people/import/actions.test.ts](app/app/church-admin/people/import/actions.test.ts) |
| People import commit action | ChurchAdmin | Pastor, Ministry Leader, Secretary, Member, Public | [app/app/church-admin/people/import/actions.test.ts](app/app/church-admin/people/import/actions.test.ts) |
| ChurchAdmin event registration approval/settings actions | ChurchAdmin, Pastor (approval path) | Ministry Leader, Secretary, Member, Public | [app/app/church-admin-actions.test.ts](app/app/church-admin-actions.test.ts) |
| ChurchAdmin communications retry/suppression actions | ChurchAdmin, Pastor | Secretary, Ministry Leader, Member, Public | [app/app/communications-actions.test.ts](app/app/communications-actions.test.ts) |
| `retryAllEligibleAction` (scoped bulk retry) | ChurchAdmin, Pastor | Secretary, Ministry Leader, Member, Public | [app/app/communications-actions.test.ts](app/app/communications-actions.test.ts) — `retryAllEligibleAction` describe block |
| Communications retry cron (`/api/cron/communications-retry`) | Cron secret only (not role-based) | Any unauthenticated request | [app/api/cron/communications-retry/route.test.ts](app/api/cron/communications-retry/route.test.ts) |
| `/app/church-admin/attendance/import` | ChurchAdmin | Pastor, Ministry Leader, Secretary, Member, Public | Route gate in `app/app/church-admin/attendance/import/page.tsx` |
| `runAttendanceImportDryRunAction` | ChurchAdmin | Pastor, Ministry Leader, Secretary, Member, Public | Action gate in `app/app/church-admin/attendance/import/actions.ts` |
| `commitAttendanceImportBatchAction` | ChurchAdmin | Pastor, Ministry Leader, Secretary, Member, Public | Action gate in `app/app/church-admin/attendance/import/actions.ts` |
| `/app/church-admin/giving/import` | ChurchAdmin | Pastor, Ministry Leader, Secretary, Member, Public | Route gate in `app/app/church-admin/giving/import/page.tsx`; action tests in [app/app/church-admin/giving/import/actions.test.ts](app/app/church-admin/giving/import/actions.test.ts) |
| `runGivingImportDryRunAction` | ChurchAdmin | Pastor, Ministry Leader, Secretary, Member, Public | [app/app/church-admin/giving/import/actions.test.ts](app/app/church-admin/giving/import/actions.test.ts) |
| `commitGivingImportBatchAction` | ChurchAdmin | Pastor, Ministry Leader, Secretary, Member, Public | [app/app/church-admin/giving/import/actions.test.ts](app/app/church-admin/giving/import/actions.test.ts) |
| `/app/church-admin/events/import` | ChurchAdmin | Pastor, Ministry Leader, Secretary, Member, Public | Route gate in `app/app/church-admin/events/import/page.tsx` |
| `handleChargeRefunded` (Stripe webhook) | No user role — service-only; verified by Stripe webhook signature | Any authenticated user role (not applicable; route is service-level) | Webhook signature verification in `app/api/webhooks/stripe/route.ts`; available in Supabase production mode |
| Member event registration action | Member | ChurchAdmin, Pastor, Ministry Leader, Secretary, Public | [app/app/member-actions.test.ts](app/app/member-actions.test.ts) |
| Public event registration action | Public | N/A (route intentionally public) | Action guards in [app/portal/actions.ts](app/portal/actions.ts) and route scoping in [app/portal/events/register/page.tsx](app/portal/events/register/page.tsx) |

## Notes

- Each row is expected to retain a corresponding executable test as behavior evolves.
- Cross-church scope protection remains mandatory for all tenant writes and should be validated in action tests whenever write paths are expanded.

## WS-4 Evidence Refresh

- Security evidence maintenance was consolidated on 2026-05-29 with the weekly go/no-go docs in [docs/security-assessment.md](docs/security-assessment.md), [docs/security-mitigation-plan.md](docs/security-mitigation-plan.md), and [docs/testing-schema.md](docs/testing-schema.md).
- Completed verification coverage referenced by this matrix includes:
	- `npm run setup:local`
	- `npm run smoke:local`
	- `npm run test:e2e:readiness`
	- `npm run test:e2e:onboarding`
	- `npm run test -- app/app/church-admin/people/import/actions.test.ts app/app/church-admin-actions.test.ts app/app/communications-actions.test.ts app/app/member-actions.test.ts`
	- `npm run lint`
	- `npm run build`

## Phase D Evidence Refresh (2026-06-02)

- Matrix expanded with Phase C surfaces added since the 2026-05-29 snapshot:
  - Attendance import route and actions (`runAttendanceImportDryRunAction`, `commitAttendanceImportBatchAction`) — ChurchAdmin only.
  - Giving import route confirmation rows (`/app/church-admin/giving/import`, `runGivingImportDryRunAction`, `commitGivingImportBatchAction`) — already had action test evidence; route row added explicitly.
  - Events import route (`/app/church-admin/events/import`) — ChurchAdmin only.
  - `retryAllEligibleAction` — existing row confirmed; ChurchAdmin and Pastor allowed, consistent with communications retry boundary.
  - `handleChargeRefunded` (Stripe webhook) — service-only, no user role; now available in Supabase production mode with signature verification.
- All new rows follow the existing format: surface name, allowed roles, denied roles, evidence reference.
- Cross-church tenant scope protection applies to all import commit actions — no import write may cross church boundaries.
