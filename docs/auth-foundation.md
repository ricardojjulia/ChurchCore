# Auth Foundation

This document describes the first authentication and protected-route layer for ChurchCore.

## Purpose

The current auth implementation establishes ChurchCore on Supabase SSR auth while preserving a local preview fallback for development environments that have not been configured yet.

## What Exists Now

- A protected sign-in route at `/sign-in`
- A simplified Mantine-based sign-in presentation with a single focused account form
- Supabase SSR auth support for email and password flows
- Root `proxy.ts` session refresh handling with explicit control-plane versus tenant client selection by route family
- Preview identities for each core ChurchCore role when Supabase env vars are absent
- Redirect preservation so protected routes can send users back to the route they requested after sign-in
- Sign-out handling for the protected shell
- An explicit app-context model that separates actor identity from the active product surface
- Session resolution from control-plane access plus church-membership data when Supabase rows exist, with route-hinted fallback order instead of a generic shared-auth client
- Church-app session profile hydration from live `public.profiles` rows when they exist
- Cookie-backed app-context selection so explicit tenant view is preserved across navigation
- Tenant-view entry and exit audit writes through Supabase when the backend is configured
- A local direct-database fallback for app-owned Supabase tables when the local REST schema cache is unavailable during development
- Surface-specific Supabase wrappers now own both SSR/browser client creation and local direct-DB fallback boundaries, which removes the last implicit shared helper path from the auth layer
- A visible header logout action in the protected shell for direct session exit
- `/sign-in` now prefers control-plane auth for `/control` redirects and tenant auth for church-app or portal redirects
- Control-plane self-sign-up is intentionally disabled; those accounts must be provisioned through ChurchCore operator workflows

## Protected Routes

- `/control`
- `/control/[section]`
- `/app`
- `/app/[role]`
- `/app/calendar`

Compatibility redirects still exist on:

- `/workspace`
- `/workspace/[role]`
- `/calendar`

## Intentional Constraints

- Supabase is approved, but production RBAC and tenant hydration are not complete yet
- Tenant claims and row-level authorization foundations now exist, but production claim issuance and full policy integration are not complete yet
- Preview mode still exists as a local fallback when Supabase env vars are missing
- Full RBAC enforcement still needs to be connected to Supabase memberships and policies
- The church app still supports role-preview switching while real membership-backed authorization is incomplete

## Context Model

- `ChurchCore Control` is available only to platform admins.
- `ChurchCore App` resolves from an active church context plus a church-facing role.
- Platform admins may enter the church app only through an explicit tenant-view action.
- The bridge back from the church app to the control plane is an explicit return action, not an implicit shared navigation model.

## Upgrade Path

This layer is intentionally thin so it can be extended with:

- Supabase Auth and tenant-aware claims
- Real role enforcement and audit-linked session metadata
