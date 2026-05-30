# ADR 0002: Control Plane and Tenant Separation

- Status: Accepted
- Date: 2026-04-11

## Context

ChurchCore has two product surfaces with different responsibilities:

- The control plane used by ChurchCore staff for tenant lifecycle, billing, support, provisioning, and oversight
- The tenant-facing church application used by individual churches for members, ministries, events, giving, care, and internal operations

The current implementation still assumes a single Supabase-backed data plane for both concerns. That makes the architecture too coupled.

This is no longer acceptable.

The platform UI and the church UI must be separated at the product boundary and at the data boundary.

## Decision

ChurchCore will separate control-plane data from tenant data.

Approved target architecture:

- One control-plane backend and database for ChurchCore platform concerns
- A separate tenant backend and database per church tenant, or a tenant-isolated tenant data plane that is operationally independent from the control-plane database
- Separate UI surfaces retained and strengthened:
  - `/control` for ChurchCore staff
  - `/app` for church users

The control-plane database owns:

- Tenant registry
- Provisioning state
- Billing and subscription metadata
- Support operations
- Platform audit trails
- Tenant connection and routing metadata
- ChurchCore staff access control

The tenant database owns:

- Members and profiles
- Ministries
- Events and calendar operations
- Giving and donor operations
- Volunteer workflows
- Pastoral and care workflows
- Church-local audit data

## Architectural Rules

- The control plane must not read or write church operational tables directly from its own database.
- The church application must not depend on control-plane tables for its day-to-day runtime data.
- Tenant-view and support tooling must go through explicit cross-boundary mechanisms, not casual shared-table access.
- New features must declare whether they belong to the control plane or the tenant app before implementation starts.
- Shared libraries may exist, but shared databases for platform and tenant runtime data are no longer the target model.

## Consequences

- The current single-project Supabase setup is transitional only.
- Existing code that reads both platform and church data from the same backend must be refactored behind explicit boundary-aware clients.
- Environment configuration must move from a single Supabase connection model to separate control-plane and tenant connection models.
- The development plan, README, and follow-up work must stop describing the current shared backend as the long-term architecture.
- Tenant provisioning becomes a first-class platform concern because tenant routing and tenant connection metadata must be maintained centrally.

## Immediate Follow-On Work

1. Update the development plan to make the split architecture the source of truth.
2. Stop adding new features that deepen the shared control-plane-plus-tenant data model.
3. Introduce separate environment and client boundaries for control-plane and tenant access.
4. Define the control-plane schema independently from the tenant schema.
5. Plan the migration path away from the current shared local Supabase setup.
