update public.tenant_connections connection
set metadata = connection.metadata || jsonb_strip_nulls(
  jsonb_build_object(
    'runtime_church_id', tenant.external_tenant_id,
    'runtime_slug', tenant.slug
  )
)
from public.tenants tenant
where connection.tenant_id = tenant.id
  and tenant.external_tenant_id is not null
  and not (connection.metadata ? 'runtime_church_id');
