# ADR 0001: Backend and Data Platform

- Status: Accepted
- Date: 2026-04-09

## Context

ChurchForge needs a backend and data platform that supports authentication, relational data, real-time collaboration, storage, and future AI workflows without slowing delivery.

The approved options from the development plan are:

1. Supabase with Postgres, Auth, Realtime, and Storage.
2. NestJS with PostgreSQL and separately selected infrastructure services.

## Decision Drivers

- Delivery speed for a product that is still shaping its domain model
- Maintainability with a small team and AI-assisted development
- Security and auditability
- Real-time capabilities for calendars, volunteer coordination, and ministry operations
- Long-term flexibility for AI integrations and analytics

## Decision

ChurchForge will use Supabase as the backend and data platform.

The approved stack for backend execution is:

- Supabase Postgres for relational data
- Supabase Auth for centralized authentication
- Supabase Realtime for calendar, volunteer, and operational updates
- Supabase Storage for media and document assets

This decision is approved because it best matches the product's current stage:

- Fastest route from frontend scaffolding to a secure multi-tenant application
- Lowest infrastructure assembly overhead for a small team
- Strong alignment with Next.js App Router and SSR auth patterns
- Native support for row-level security, audit-aware data access, and realtime event surfaces
- Enough flexibility to add server-side AI workflows, analytics, and integrations later

NestJS plus PostgreSQL remains a valid future evolution path only if Supabase becomes a constraint that clearly outweighs its delivery speed advantages.

## Consequences

- New authentication work should target Supabase SSR auth, not additional preview-only session systems.
- Data modeling should move into Supabase migrations with explicit multi-tenant boundaries and row-level security.
- Application data access should be isolated behind `lib/supabase/` clients and server-side boundaries.
- Role and tenant enforcement should ultimately come from Supabase-backed claims, memberships, and policies rather than frontend assumptions.
- Preview or mock-only flows should now be treated as temporary scaffolding on the path to Supabase-backed features, not as a long-term architecture.
