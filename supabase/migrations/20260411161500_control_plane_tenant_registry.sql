do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'tenant_status'
  ) then
    create type public.tenant_status as enum (
      'draft',
      'provisioning',
      'active',
      'suspended',
      'archived'
    );
  end if;

  if not exists (
    select 1
    from pg_type
    where typname = 'tenant_billing_status'
  ) then
    create type public.tenant_billing_status as enum (
      'trialing',
      'active',
      'past_due',
      'canceled',
      'manual_review'
    );
  end if;

  if not exists (
    select 1
    from pg_type
    where typname = 'tenant_backend_kind'
  ) then
    create type public.tenant_backend_kind as enum (
      'supabase'
    );
  end if;

  if not exists (
    select 1
    from pg_type
    where typname = 'tenant_connection_status'
  ) then
    create type public.tenant_connection_status as enum (
      'pending',
      'ready',
      'error'
    );
  end if;
end $$;

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  external_tenant_id uuid unique,
  name text not null,
  slug citext not null unique,
  timezone text not null default 'America/New_York',
  tenant_status public.tenant_status not null default 'draft',
  billing_status public.tenant_billing_status not null default 'trialing',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.tenant_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references public.tenants (id) on delete cascade,
  backend_kind public.tenant_backend_kind not null default 'supabase',
  project_url text,
  db_url text,
  connection_status public.tenant_connection_status not null default 'pending',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists tenants_external_tenant_id_idx
  on public.tenants (external_tenant_id);

create index if not exists tenants_tenant_status_idx
  on public.tenants (tenant_status);

create index if not exists tenants_billing_status_idx
  on public.tenants (billing_status);

create index if not exists tenant_connections_connection_status_idx
  on public.tenant_connections (connection_status);

drop trigger if exists set_tenants_updated_at on public.tenants;

create trigger set_tenants_updated_at
before update on public.tenants
for each row
execute function public.set_updated_at();

drop trigger if exists set_tenant_connections_updated_at on public.tenant_connections;

create trigger set_tenant_connections_updated_at
before update on public.tenant_connections
for each row
execute function public.set_updated_at();

alter table public.tenants enable row level security;
alter table public.tenant_connections enable row level security;

create policy "tenants_select_platform_admin"
on public.tenants
for select
to authenticated
using (public.is_platform_admin());

create policy "tenants_manage_platform_admin"
on public.tenants
for all
to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

create policy "tenant_connections_select_platform_admin"
on public.tenant_connections
for select
to authenticated
using (public.is_platform_admin());

create policy "tenant_connections_manage_platform_admin"
on public.tenant_connections
for all
to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

insert into public.tenants (
  external_tenant_id,
  name,
  slug,
  timezone,
  tenant_status,
  billing_status
)
select
  church.id,
  church.name,
  church.slug,
  church.timezone,
  'active'::public.tenant_status,
  'trialing'::public.tenant_billing_status
from public.churches church
where not exists (
  select 1
  from public.tenants tenant
  where tenant.external_tenant_id = church.id
     or tenant.slug = church.slug
);

insert into public.tenant_connections (
  tenant_id,
  backend_kind,
  connection_status,
  metadata
)
select
  tenant.id,
  'supabase'::public.tenant_backend_kind,
  'ready'::public.tenant_connection_status,
  jsonb_build_object(
    'bootstrap_source',
    'churches',
    'external_tenant_id',
    tenant.external_tenant_id
  )
from public.tenants tenant
where tenant.external_tenant_id is not null
  and not exists (
    select 1
    from public.tenant_connections connection
    where connection.tenant_id = tenant.id
  );
