# Control Plane

This document describes the platform-side ChurchCore Ops Control experience.

## Purpose

The control plane exists for ChurchCore Ops staff operating the SaaS itself. It is intentionally separate from the tenant-facing church app.

The UI direction for this surface is now intentionally lighter and quieter: light-only, low-chrome, and short on-page copy so operator attention stays on tenant status and explicit tenant-view actions.

## Routes

- `/control`
- `/control/[section]`
- `/controll` redirects to `/control`
- Unauthorized access now routes through a forced sign-in flow for control-plane accounts instead of silently dropping back into a tenant workspace

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

This surface still falls back to preview mode locally when Supabase is not configured, but ADR 0002 now makes the current shared-backend approach transitional only. Durable tenant workflows, full support tooling, richer impersonation controls, and the control-plane database itself now need to be implemented as a separate platform data plane.

## Live Data Path

- Tenant registry resolves from `public.tenants`
- Tenant connection readiness resolves from `public.tenant_connections`
- Tenant runtime routing resolves from `public.tenant_connections.metadata.runtime_church_id`
- Tenant-view audit activity resolves from `public.tenant_view_audit_logs`
- Preview fallback still exists when Supabase env vars are absent locally
- Tenant-view launch resolves through control-plane registry records before any tenant app impersonation path is opened

## Architectural Direction

- The control plane keeps tenant registry, provisioning, billing, support, platform audit, and routing metadata.
- The control plane must not become the long-term database for church operational data such as member, ministry, or event runtime records.
- The current repo now includes the first control-plane registry migration for `tenants` and `tenant_connections`, with transitional bootstrap data copied from existing church records.
