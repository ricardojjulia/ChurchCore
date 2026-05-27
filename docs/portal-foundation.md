# Portal Foundation

This document describes the first application-facing slice added on top of the ChurchCore Ops marketing shell.

## Purpose

The route family under `app/app/` demonstrates the tenant-facing church application while the repo moves from preview UI into the approved Supabase backend path.

The control plane is now explicitly separate under `app/control/`. This document covers only the church app side.

It is protected by Supabase SSR auth when configured and falls back to preview auth locally when needed.

ChurchAdmin deep-workspace interactions now persist in preview mode through server actions plus cookie-backed state, so the application can behave more realistically before the full Supabase record model is wired in.

The church app now also resolves from an explicit church context. Platform admins enter it only through a deliberate tenant-view action instead of sharing navigation with the control plane.

The current UI direction is intentionally simpler than before: light-only, restrained navigation, shorter labels, and fewer high-emphasis panels so the church app can reveal detail progressively instead of shouting all of it at once.

The current session layer also hydrates church-user name, role, title, and church scope from live `profiles` records when they are available.

ADR 0002 now makes the current shared-backend wiring transitional only. The long-term target is a tenant data plane that is separate from the control-plane database.

## Included Church Roles

- `church-admin`
- `pastor`
- `ministry-leader`
- `member`

These map directly to the church-facing role structure defined in `DEVELOPMENT_PLAN.md`. `super-admin` now belongs to the control plane instead of the church app navigation model.

## What This Slice Covers

- Role-based routing across distinct church surfaces
- A Mantine-based application shell with restrained visual hierarchy, navigation, and role context
- A first real member-portal slice backed by live `profiles`, `profile_ministries`, family context, directory data, and upcoming `events`
- A public `/portal` landing route with sign-in and request-access entry points
- A public `/portal/register` route for member portal access requests
- Host-aware church resolution for `/portal` and `/portal/register` when entered from a tenant hostname
- Dedicated `/app/member/directory` and `/app/member/family` routes so member detail is split into focused screens instead of one overloaded home page
- Member-home visibility into personal attendance history and upcoming serving assignments
- Self-service editing for `preferred_contact_method` and `interests`
- Communication preference capture inside the member portal with consent-log writes on change
- Day-scoped parent children check-in/checkout links with safe unavailable states and stronger checkout verification (PIN/QR or pickup code, guardian verification, custody and authorized-pickup checks)
- A live calendar slice backed by categorized `events`
- A simplified church-admin operations board with lane-based preview state
- A dedicated `/app/church-admin/people` route for tenant-backed people management
- A dedicated `/app/church-admin/accounts` route for portal-request review and approval
- A dedicated `/app/church-admin/events/[id]` route for event roster and attendance management
- A pastor-specific workspace backed by tenant profile, ministry, and follow-up data, plus a dedicated `/app/pastor/people` screen
- A pastoral-care foundation on `/app/pastor/people` with confidential notes and care assignments
- A simpler role workspace pattern for ministry-leader entry points

## What This Slice Does Not Cover Yet

- Complete tenant-isolation verification
- Full database writes across all church-app surfaces
- Full pastoral-notes and care-assignment workflows
- Notifications, routing rules, and richer care governance
- Realtime updates
- Background jobs
- Migration of church runtime data access onto a tenant backend separated from the control plane

Those concerns now need to be implemented on Supabase instead of expanded as backend-agnostic placeholders.

## Sprint 2 Notes

Sprint 2 changes the meaning of the portal surface in two important ways.

First, `/portal` is no longer only an authenticated entry point. It now serves as the public front door for member identity requests. That means the portal surface must now support both anonymous visitors and authenticated church members, while still keeping tenant data behind explicit request or session boundaries.

Second, the member portal is no longer just a profile-and-directory view. It now exposes:

- recent attendance history
- upcoming serving assignments from event rosters
- portal-safe member identity via `member_number`
- expanded self-service profile preferences

This makes the portal meaningfully useful to members without widening the public data surface.
