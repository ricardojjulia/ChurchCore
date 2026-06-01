-- ADR 0002 completion: remove control-plane tables from the tenant runtime project.
-- These tables (tenants, tenant_connections) now live exclusively in the
-- control-plane Supabase project. Application code reads them via
-- createControlPlaneServerClient() / queryControlPlaneLocalDb() only.

-- Removing control-plane table from tenant DB; now lives exclusively in the control-plane project (ADR 0002)
drop table if exists public.tenant_connections cascade;
-- Removing control-plane table from tenant DB; now lives exclusively in the control-plane project (ADR 0002)
drop table if exists public.tenants cascade;
