# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog and this project follows Semantic Versioning.

## [Unreleased]

### Added

- Added `docs/UI-UPDATES.md` to document the approved blue-neutral UI direction, component rules, and the current dark-mode deferral.
- Added ADR 0002 in [docs/adr/0002-control-plane-and-tenant-separation.md](/Users/rjulia/ChurchForge/docs/adr/0002-control-plane-and-tenant-separation.md) to make control-plane and tenant separation the approved architecture.
- Added a control-plane tenant-registry migration for `tenants` and `tenant_connections`, including bootstrap data copied from existing church records.
- Added server actions for tenant calendar event create, update, and delete flows, including local direct-Postgres fallback support.
- Added tenant calendar RSVP mutation actions backed by `event_rsvps` records.
- Added FullCalendar dependencies and integrated month, week, and day calendar rendering in the tenant calendar surface.

### Changed

- Updated the Mantine theme and global UI tokens to a blue-neutral, higher-contrast system aligned to the new UI guidance.
- Restyled the shared application shell, session controls, landing page, and `/control` around the updated palette and a simpler visual hierarchy.
- Documented the current UI direction in the README so future visual changes have an explicit repo-level reference.
- Updated the development plan, README, `.env.example`, and TODOs so the repo no longer treats one shared control-plane-plus-tenant database as the target architecture.
- Split the backend access layer in code into control-plane and tenant wrappers, and moved the session, audit, control-plane, and tenant data loaders onto those scoped paths while retaining transitional shared-env fallback.
- Changed control-plane tenant launch to resolve from registry `tenantId` records and `tenant_connections` instead of posting church runtime IDs directly from the UI.
- Extended the live tenant calendar board to include quick-add event creation, in-drawer event editing and deletion, and user RSVP controls.
- Extended tenant calendar data hydration to include each viewer's current RSVP status per event.
- Upgraded the tenant calendar board from a list-only surface to an interactive month/week/day calendar with category filtering including an "all" option.

## [1.0.0] - 2026-04-11

### Added

- Added a `/controll` compatibility redirect to `/control`.
- Added `SUPABASE.md` to document the current local Supabase development URLs, keys, storage settings, and app env mapping.
- Added Supabase SSR foundations including browser and server helpers, a root `proxy.ts`, and an auth confirmation route.
- Added `.env.example` plus an initial Supabase SQL migration for profiles, churches, memberships, ministries, events, RSVPs, and volunteer shifts with RLS foundations.
- Added preview sign-in scaffolding with cookie-backed protected-route flow for the workspace and calendar modules.
- Added a role-based workspace preview under `app/workspace/` with distinct portal views for SuperAdmin, ChurchAdmin, Pastor / Elder, MinistryAdmin / Leader, and Volunteer / Member workflows.
- Added a protected working calendar module under `/calendar` for all-events breakdowns, volunteer load watch, approvals, and resource conflict visibility.
- Added a deeper ChurchAdmin portal board with care queue, weekend readiness, communications, and giving snapshot sections.
- Added `docs/auth-foundation.md` and `docs/working-calendar.md` to document the new protected shell and calendar module.
- Added `docs/church-admin-workspace.md` to document the first role-specific deep workspace.
- Added `docs/portal-foundation.md` to document the scope and intentional backend constraints of the new application slice.
- Added `docs/control-plane.md` to document the new platform-side control plane boundary and routes.
- Added `docs/todo.md` to track the remaining Supabase project hookup tasks after ADR 0001 approval.
- Added Mantine as the primary application-facing UI system for the landing page, sign-in flow, app shell, workspace, and calendar surfaces.
- Added membership-aware app-context resolution plus explicit tenant-view actions so control-plane users can intentionally enter and exit a church-app context.
- Added a second Supabase migration for `tenant_view_audit_logs` so platform-side tenant view entry and exit can be audited.
- Added a live church-calendar data loader backed by Supabase `events` records, category counts, and approval-queue derivation.

### Changed

- Updated the source-of-truth plan and README so Mantine is the standard UI framework for ChurchForge going forward.
- Merged `DEVELOPMENT_PLAN.md` v1.4 with the new sprint roadmap, Sprint 1 schema priorities, categorized calendar direction, and updated source-of-truth structure.
- Updated the README to reference the v1.4 development plan and its Sprint 1 priorities.
- Started Sprint 1 execution by aligning the local Supabase schema toward member-portal profiles, ministry assignments, and categorized events, and by hydrating church-app sessions from live `profiles` rows when available.
- Added the first real member portal slice under `/app/member`, backed by live `profiles`, `profile_ministries`, and categorized `events` data.
- Accepted ADR 0001 in favor of Supabase and updated the repo copy to reflect an approved backend path instead of an undecided one.
- Updated the sign-in flow to use Supabase SSR auth when configured, with the original preview identities retained only as a local fallback.
- Aligned package metadata naming on `ChurchForge` by updating the npm lockfile package name from the old bootstrap identifier to `churchforge`.
- Updated the landing page to route into sign-in, workspace, and calendar entry points so the repo now includes a protected application surface alongside the marketing shell.
- Redesigned the protected application UI with a premium dashboard shell, stronger sidebar navigation, denser metric cards, and more intentional ChurchAdmin and calendar operating surfaces.
- Redesigned the landing page and sign-in route to match the stronger product direction, and added stateful dashboard interactions for role switching, queue views, and calendar filtering.
- Added segmented operation lanes, detail drawers, and local mutation flows to the ChurchAdmin workspace and calendar board so those surfaces behave more like real application modules.
- Added cookie-backed preview persistence with server actions for ChurchAdmin and calendar mutations so state now survives refresh and navigation before Supabase records are connected.
- Rebuilt the primary product surfaces on Mantine with a lighter, more restrained interaction model and reduced visual clutter across the landing, sign-in, workspace, and calendar experiences.
- Split the product into a real platform control plane under `/control` and a tenant-facing church app under `/app`, with legacy `/workspace` and `/calendar` routes retained only as compatibility redirects.
- Changed church-app navigation and route guards to resolve from the active app context instead of letting roles and product surfaces blur together.
- Changed the control plane to read live church, membership, and tenant-view audit data from Supabase when configured, while preserving preview fallback locally.
- Simplified the main control-plane and church-app shells into a lighter, light-only Mantine experience with reduced copy, flatter surfaces, and less visual chrome.
- Simplified the role workspaces and ChurchAdmin surface further by removing the promo-style metrics, heavier explainer copy, and extra dashboard chrome.
- Simplified the sign-in flow into a single focused card and removed the extra explainer panels and preview-heavy copy.
- Rebuilt the landing page as a minimal entry screen and removed the heavy preview grids, role boxes, metrics, and marketing sections.
- Added a local direct-Postgres fallback for app-owned Supabase table reads and writes when the local PostgREST schema cache is unavailable.
- Replaced the preview calendar board with a live categorized event board backed by Supabase reads.
- Removed the unused `next-themes` dependency and kept the app on a light-only Mantine configuration.
- Replaced the placeholder development plan with a fully expanded v1.3 source-of-truth document covering project vision, RBAC portals, core features, AI ministry tools, calendar and volunteer workflows, security, SDLC discipline, and maintenance expectations.
- Updated the README and in-app development-plan references to align with the revised plan language and scope.
- Updated the pull request template and added feature and bug issue templates that require plan-section references, documentation impact notes, and security or AI review context.

### Fixed

- Fixed a Mantine theme-toggle hydration mismatch by deferring client color-scheme resolution until after the initial render, so SSR and client hydration stay aligned.

## [0.1.0] - 2026-04-09

### Added

- Bootstrapped the ChurchForge frontend with Next.js App Router, TypeScript, and Tailwind CSS.
- Established a disciplined repo structure with `app`, `components`, `lib`, and `docs`.
- Added a polished landing page aligned with the ministry platform vision.
- Added shared UI primitives, theme support, and CI verification.
- Added project documentation baseline including the development plan and initial ADR scaffolding.
