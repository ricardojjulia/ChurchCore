# Security Role-Access Matrix

Date: 2026-05-29
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
| ChurchAdmin people import route (`/app/church-admin/people/import`) | ChurchAdmin | Pastor, Ministry Leader, Secretary, Member, Public | Route gate in [app/app/church-admin/people/import/page.tsx](app/app/church-admin/people/import/page.tsx) and action tests in [app/app/church-admin/people/import/actions.test.ts](app/app/church-admin/people/import/actions.test.ts) |
| People import dry-run action | ChurchAdmin | Pastor, Ministry Leader, Secretary, Member, Public | [app/app/church-admin/people/import/actions.test.ts](app/app/church-admin/people/import/actions.test.ts) |
| People import commit action | ChurchAdmin | Pastor, Ministry Leader, Secretary, Member, Public | [app/app/church-admin/people/import/actions.test.ts](app/app/church-admin/people/import/actions.test.ts) |
| ChurchAdmin event registration approval/settings actions | ChurchAdmin, Pastor (approval path) | Ministry Leader, Secretary, Member, Public | [app/app/church-admin-actions.test.ts](app/app/church-admin-actions.test.ts) |
| ChurchAdmin communications retry/suppression actions | ChurchAdmin, Pastor | Secretary, Ministry Leader, Member, Public | [app/app/communications-actions.test.ts](app/app/communications-actions.test.ts) |
| `retryAllEligibleAction` (scoped bulk retry) | ChurchAdmin, Pastor | Secretary, Ministry Leader, Member, Public | [app/app/communications-actions.test.ts](app/app/communications-actions.test.ts) — `retryAllEligibleAction` describe block |
| Communications retry cron (`/api/cron/communications-retry`) | Cron secret only (not role-based) | Any unauthenticated request | [app/api/cron/communications-retry/route.test.ts](app/api/cron/communications-retry/route.test.ts) |
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
