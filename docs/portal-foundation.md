# Portal Foundation

This document describes the first application-facing slice added on top of the ChurchForge marketing shell.

## Purpose

The route family under `app/app/` demonstrates the tenant-facing church application while the repo moves from preview UI into the approved Supabase backend path.

The control plane is now explicitly separate under `app/control/`. This document covers only the church app side.

It is protected by Supabase SSR auth when configured and falls back to preview auth locally when needed.

ChurchAdmin deep-workspace interactions now persist in preview mode through server actions plus cookie-backed state, so the application can behave more realistically before the full Supabase record model is wired in.

The church app now also resolves from an explicit church context. Platform admins enter it only through a deliberate tenant-view action instead of sharing navigation with the control plane.

The current UI direction is intentionally simpler than before: light-only, restrained navigation, shorter labels, and fewer high-emphasis panels so the church app can reveal detail progressively instead of shouting all of it at once.

The current session layer also hydrates church-user name, role, title, and church scope from live `profiles` records when they are available.

## Included Church Roles

- `church-admin`
- `pastor`
- `ministry-leader`
- `member`

These map directly to the church-facing role structure defined in `DEVELOPMENT_PLAN.md`. `super-admin` now belongs to the control plane instead of the church app navigation model.

## What This Slice Covers

- Role-based routing across distinct church surfaces
- A Mantine-based application shell with restrained visual hierarchy, navigation, and role context
- A first real member-portal slice backed by live `profiles`, `profile_ministries`, and upcoming `events`
- A live calendar slice backed by categorized `events`
- A simplified church-admin operations board with lane-based preview state
- A simpler role workspace pattern for pastor and ministry-leader entry points

## What This Slice Does Not Cover Yet

- Complete tenant-isolation verification
- Full database writes across all church-app surfaces
- Realtime updates
- Background jobs

Those concerns now need to be implemented on Supabase instead of expanded as backend-agnostic placeholders.
