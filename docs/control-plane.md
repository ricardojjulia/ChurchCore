# Control Plane

This document describes the platform-side ChurchForge Control experience.

## Purpose

The control plane exists for ChurchForge staff operating the SaaS itself. It is intentionally separate from the tenant-facing church app.

The UI direction for this surface is now intentionally lighter and quieter: light-only, low-chrome, and short on-page copy so operator attention stays on tenant status and explicit tenant-view actions.

## Routes

- `/control`
- `/control/[section]`
- `/controll` redirects to `/control`

## What This Surface Covers

- Tenant onboarding and provisioning readiness
- Billing recovery and renewal visibility
- Support escalation and access-review queues
- Platform health, governance, and operator context
- Explicit tenant-view launch actions for entering the church app intentionally
- Recent tenant-view audit visibility for platform operators

## What This Surface Must Not Become

- A church-facing workspace
- A place for member, event, or ministry operations
- A hidden path back into church navigation without explicit impersonation or tenant-view flows

## Current Constraint

This surface still falls back to preview mode locally when Supabase is not configured, but it now resolves real app context from Supabase membership and platform-admin rows when those records exist. Durable tenant workflows, full support tooling, and richer impersonation controls still need to be connected to the approved backend path.

## Live Data Path

- Tenant counts resolve from `public.churches`
- Membership counts resolve from `public.church_memberships`
- Tenant-view audit activity resolves from `public.tenant_view_audit_logs`
- Preview fallback still exists when Supabase env vars are absent locally
