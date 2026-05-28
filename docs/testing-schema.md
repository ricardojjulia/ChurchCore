# ChurchCore Ops Testing Schema

This document closes the current gap between the development plan and the repository state. `DEVELOPMENT_PLAN.md` requires testing across unit, integration, manual, and security paths, but the current repo only had lint, build, and shell smoke helpers. The schema below defines the application-specific test surface and the verification layers each area must pass.

## Current Alignment Snapshot

### In Place

- `npm run lint`
- `npm run build`
- `npm run smoke:preview`
- `npm run smoke:local`
- `npm run test:e2e:readiness`
- local Supabase bootstrap and seed flows

### Missing Before This Change

- a first-class test runner in `package.json`
- unit coverage for pure business logic helpers
- component render checks for application screens and navigation
- integration tests for server actions and data-layer role enforcement
- a route-by-route coverage map tied to the actual app surface

## Verification Layers

### Layer 0: Static Verification

- `npm run lint`
- `npm run build`
- `npm run test`
- `npm run smoke:preview`
- `npm run smoke:local`
- `npm run test:e2e:readiness`

### Layer 1: Unit Logic Tests

- pure helpers in `lib/`
- import parsers, formatting, date normalization, derived metrics, transformation helpers
- route helper functions and UI navigation state helpers when extracted

### Layer 2: Component and Screen Execution Tests

- render-only checks for route shells and high-value workspace components
- navigation visibility by role
- empty, loading, preview, and hydrated states
- critical CTA visibility and disabled-state logic

### Layer 3: Server Action Integration Tests

- role gates on every `actions.ts` module
- validation failures for malformed input
- preview-mode fallbacks when tenant backend env is absent
- success-path mutations against mocked tenant clients
- path revalidation side effects for routes that refresh data

### Layer 4: Data Access and Tenant Boundary Tests

- `shouldUseLocalTenantFallback()` branch selection
- local Postgres and Supabase branch parity
- church scoping and role scoping in read helpers
- explicit non-leakage of restricted fields for CCM, finance, and control-plane support views

### Layer 5: Manual and Smoke Flows

- sign-in and church-context hydration
- browser-level ChurchAdmin weekly readiness route path
- browser-level denied-role checks for Secretary, Pastor, Ministry Leader, and Member against ChurchAdmin-only readiness targets
- giving journey and public giving page
- member profile, family, directory, ministries, groups, schedule
- church-admin people, events, attendance, volunteers, finance, groups, visitors
- CCM check-in, checkout, incidents, roster, emergency view, volunteers
- communications, reporting, elders discernment, ministry forge

### Layer 6: Security and Compliance Tests

- RBAC route access
- server action role denial
- RLS verification in local Supabase
- PII masking and restricted-data redaction
- audit-log creation for sensitive writes
- consent and export/delete flows for data-rights routes
- pending-review member data-rights behavior (deletion request + cancellation)

## Coverage Map

Status values:

- `Existing`: already covered by current repo tooling
- `Foundation`: covered by the new test harness introduced now
- `Missing`: still requires dedicated test implementation

### Public and Shared Routes

| Surface | Route files | Required tests | Status |
| --- | --- | --- | --- |
| Marketing and planning | `app/page.tsx`, `app/plan/page.tsx`, `app/portal/page.tsx`, `app/portal/register/page.tsx` | render, content sanity, CTA links, preview-mode fallback | Missing |
| Sign-in | `app/sign-in/page.tsx`, `app/sign-in/actions.ts` | render, validation, redirect, preview-mode branch | Foundation |
| Calendar | `app/calendar/page.tsx`, `app/calendar/actions.ts`, `app/app/calendar/page.tsx` | render, event loading, category filtering, action validation | Missing |
| Workspace previews | `app/workspace/page.tsx`, `app/workspace/[role]/page.tsx`, `app/workspace/actions.ts` | role routing, preview content, invalid-role handling | Missing |
| Control plane public shell | `app/control/page.tsx`, `app/control/[section]/page.tsx`, `app/control/launch-checklist/page.tsx`, `app/control/actions.ts` | section routing, support controls, access restrictions | Missing |
| Public giving | `app/give/[slug]/page.tsx`, `components/application/public-giving-page.tsx`, `app/app/giving-actions.ts` | slug resolution, form state, Stripe stub path, thank-you state | Foundation |
| ADR and documentation route | `app/adr/backend-platform/page.tsx` | render and content wiring | Missing |

### Tenant App Routes

| Surface | Route files | Required tests | Status |
| --- | --- | --- | --- |
| App shell and role landing | `app/app/page.tsx`, `app/app/[role]/page.tsx`, `app/layout.tsx`, `components/application/app-shell.tsx`, `components/application/portal-workspace.tsx` | auth guard, role nav, active-path state, church-context rendering | Missing |
| Member portal | `app/app/member/directory/page.tsx`, `app/app/member/family/page.tsx`, `app/app/member/data-rights/page.tsx`, `app/app/member/giving/page.tsx`, `app/app/member/schedule/page.tsx`, `app/app/member/ministries/page.tsx`, `app/app/member/groups/page.tsx` | render, empty state, hydrated state, permissions, action wiring | Missing |
| Pastor and elders | `app/app/pastor/people/page.tsx`, `app/app/elders/discernment/page.tsx`, `app/app/elders/discernment/[sessionId]/page.tsx`, `app/app/elders-actions.ts` | role gate, render, discernment flow validation | Missing |
| Communications | `app/app/communications/page.tsx`, `app/app/communications-actions.ts`, `components/application/communications-hub.tsx` | channel toggles, validation, preview-mode behavior, readiness target-state evidence | Started |
| Reports | `app/app/reports/page.tsx`, `app/app/reports/events/page.tsx`, `app/app/reports/giving/page.tsx`, `app/app/reports/members/page.tsx`, `components/application/reports-dashboards.tsx` | data rendering, chart fallbacks, role visibility, readiness target-state evidence | Started |
| Council and ministry forge | `app/app/council/forge/page.tsx`, `app/app/church-admin/ministry/page.tsx`, `app/app/church-admin/ministry/[id]/page.tsx`, `components/application/ministry-forge-dashboard.tsx`, track components | dashboard aggregation, per-track rendering, disclaimer presence, metric derivation | Missing |

### Church Admin Operational Routes

| Surface | Route files | Required tests | Status |
| --- | --- | --- | --- |
| People and accounts | `app/app/church-admin/people/page.tsx`, `app/app/church-admin/accounts/page.tsx`, `app/app/church-admin-actions.ts`, people/account components | invite flow, edit validation, member number generation, preview fallback | Started: member pending-change review queue wiring plus local-fallback action/data tests |
| Weekly readiness path | `app/app/church-admin/readiness/page.tsx`, readiness target route pages, `tests/e2e/church-admin-readiness.spec.ts` | browser sign-in, church-context hydration, readiness route traversal, target text assertions, tenant denied-role assertions | Foundation |
| Events | `app/app/church-admin/events/page.tsx`, `app/app/church-admin/events/[id]/page.tsx`, `components/application/church-admin-event-workspace.tsx`, `app/app/church-admin-actions.ts` | event list, create action, roster assignment, quick check-in, visitor add | Foundation |
| Attendance and volunteers | `app/app/church-admin/attendance/page.tsx`, `app/app/church-admin/volunteers/page.tsx`, `app/app/church-admin/volunteers/schedules/page.tsx`, `app/app/church-admin/volunteers/schedules/[id]/page.tsx`, `app/app/volunteer-actions.ts` | headcount logging, scheduling rules, volunteer matching, duplicate handling | Foundation |
| Groups and visitors | `app/app/church-admin/groups/page.tsx`, `app/app/church-admin/groups/[id]/page.tsx`, `app/app/church-admin/visitors/page.tsx`, `app/app/groups-actions.ts` | group create/edit, join approvals, visitor workflow advancement | Foundation |
| Giving admin | `app/app/church-admin/giving/page.tsx`, `app/app/giving-actions.ts`, `app/app/donations-actions.ts` | fund mapping, GL posting idempotency, public-page config, donation stub path | Foundation |
| Finance | `app/app/church-admin/finance/**/page.tsx`, `components/application/finance-*.tsx`, `app/app/finance-actions.ts`, `lib/finance-import.ts` | parser correctness, journal balancing, budget variance, import wizard execution | Foundation |
| CCM | `app/app/church-admin/children/**/page.tsx`, `components/application/ccm-*.tsx`, `app/app/ccm-actions.ts`, `lib/ccm-data.ts` | child safety access control, PIN flow, QR flow, roster redaction, incident handling | Foundation |

### Shared Data and Domain Modules

| Module family | Files | Required tests | Status |
| --- | --- | --- | --- |
| Data loaders | `lib/*-data.ts` | branch parity, church scoping, fallback behavior, restricted-field handling | Missing |
| Domain types and transforms | `lib/*-types.ts`, `lib/utils.ts`, `lib/finance-import.ts` | pure transform correctness and edge cases | Foundation |
| Routing and control-plane support | `lib/control-plane*.ts`, `lib/portal.ts`, `lib/site.ts` | route derivation, support-banner state, cross-boundary safety | Missing |
| Stripe and notifications | `lib/stripe/**`, `lib/notifications/**` | stub path, payload generation, environment guards | Missing |
| Auth and tenant support | `lib/auth.ts`, `lib/supabase/**` | session gate behavior, missing-env branches, tenant/client branching | Foundation |

### Application Components

| Component family | Examples | Required tests | Status |
| --- | --- | --- | --- |
| Navigation | `components/application/member-bottom-nav.tsx`, `components/application/portal-workspace.tsx`, `components/application/ccm-nav.ts` | visible items, active-path logic, role filtering | Foundation |
| Workspace components | people, events, finance, ministry, reports, communications | render, empty state, hydrated state, CTA visibility | Started: shared readiness target-state component plus browser assertions for settings, accounts, people, events, children, volunteers, giving/finance, finance journals, communications, reports, and workflows |
| Sensitive UI | CCM, finance import, data-rights, giving, pastoral care | masking, disclaimers, validation, confirmation states | Missing |

## Immediate Execution Order

1. Keep `lint`, `build`, `smoke:preview`, and `smoke:local` green on every change.
2. Expand the Vitest suite across pure `lib/` helpers and navigation/component state.
3. Continue mocked server-action integration tests for remaining action surfaces while prioritizing route render execution tests now that `sign-in`, `church-admin-actions`, `ccm-actions`, `finance-actions`, `groups-actions`, `giving-actions`, `donations-actions`, and `volunteer-actions` are covered.
4. Continue route render tests for remaining public routes, member routes, and church-admin workspaces after the new baseline coverage for sign-in, member giving, volunteer schedules, and the CCM dashboard.
5. Add local Supabase verification scripts for RBAC, RLS, audit-log writes, and sensitive-field redaction.
6. Expand Playwright from ChurchAdmin readiness route traversal into resolution actions, denied-role route checks, and mobile member browser checks.
7. Provision local control-plane browser credentials so Control Plane denied-route checks can move from skipped to enforced.

## Initial Coverage Added Now

- `lib/utils.test.ts`
- `lib/finance-import.test.ts`
- `components/application/member-bottom-nav.test.tsx`
- `app/sign-in/actions.test.ts`
- `app/app/giving-actions.test.ts`
- `app/app/groups-actions.test.ts`
- `app/app/finance-actions.test.ts`
- `app/app/church-admin-actions.test.ts`
- `app/app/actions.test.ts`
- `app/app/ccm-actions.test.ts`
- `app/app/donations-actions.test.ts`
- `app/app/volunteer-actions.test.ts`
- `app/sign-in/page.test.tsx`
- `lib/supabase/config.test.ts`
- `app/app/member/giving/page.test.tsx`
- `app/app/church-admin/volunteers/schedules/page.test.tsx`
- `app/app/church-admin/children/dashboard/page.test.tsx`
- `playwright.config.ts`
- `tests/e2e/church-admin-readiness.spec.ts`
- `tests/e2e/member-mobile-foundation.spec.ts`
- `lib/compliance/data-rights-actions.test.ts`
- `lib/communications/provider-adapter.test.ts`
- `lib/church-admin-people-data.test.ts`
- `lib/member-portal-data.test.ts`
- `vitest.config.ts` and `vitest.setup.ts`
- `package.json` test scripts

This is the foundation layer only. It does not yet satisfy the full testing requirement from the development plan, but it converts the current undocumented gap into an executable baseline and a concrete route-by-route backlog.
