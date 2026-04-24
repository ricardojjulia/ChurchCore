-- ============================================================
-- Control Plane Seed — Local Development
-- ============================================================
-- Bootstraps the two active demo tenants so the control-plane
-- dashboard and routing work locally without a real hosted project.
--
-- church_id values must match the corresponding church UUIDs in
-- the tenant runtime DB (supabase/seed.sql or hosted project).
-- ============================================================

-- churchforge
insert into public.tenants (
  id,
  external_tenant_id,
  name,
  slug,
  timezone,
  tenant_status,
  billing_status
)
values (
  gen_random_uuid(),
  '3b749abd-c102-479f-9090-415057a03262',
  'Church Forge',
  'churchforge',
  'America/Chicago',
  'active',
  'trialing'
)
on conflict (slug) do nothing;

-- graceharbor
insert into public.tenants (
  id,
  external_tenant_id,
  name,
  slug,
  timezone,
  tenant_status,
  billing_status
)
values (
  gen_random_uuid(),
  '980f4d98-1520-464d-ab4d-07118a2f67cc',
  'Grace Harbor Church',
  'graceharbor',
  'America/New_York',
  'active',
  'trialing'
)
on conflict (slug) do nothing;

-- Seed tenant_connections pointing to the shared hosted tenant project.
-- project_url and db_url are intentionally blank for local dev; set them
-- via env vars or update this seed when provisioning per-tenant projects.
insert into public.tenant_connections (
  tenant_id,
  backend_kind,
  connection_status,
  metadata
)
select
  t.id,
  'supabase',
  'ready',
  jsonb_build_object(
    'runtime_church_id', t.external_tenant_id::text,
    'runtime_slug', t.slug
  )
from public.tenants t
where t.slug in ('churchforge', 'graceharbor')
  and not exists (
    select 1 from public.tenant_connections c where c.tenant_id = t.id
  );
