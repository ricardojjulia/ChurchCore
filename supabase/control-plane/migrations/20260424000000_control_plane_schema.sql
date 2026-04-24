-- ============================================================
-- Control Plane Schema — ChurchCore Ops
-- ============================================================
-- This migration runs in the CONTROL PLANE Supabase project only.
-- It is NOT applied to the tenant runtime project.
--
-- Tables in this migration:
--   profiles           — platform-staff identity (links to control-plane auth.users)
--   platform_admins    — designates platform staff
--   tenants            — tenant registry (lifecycle, billing metadata)
--   tenant_connections — per-tenant backend connection metadata
--   tenant_view_audit_logs — audit trail for staff entering a tenant view
--
-- Cross-boundary notes:
--   tenant_view_audit_logs.church_id is a soft reference to a church in the
--   tenant runtime DB. No FK constraint is possible across databases; the
--   application layer is responsible for providing a valid church UUID.
-- ============================================================

create extension if not exists pgcrypto;
create extension if not exists citext;

-- ─── Helper functions ──────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

-- ─── Enums ─────────────────────────────────────────────────

do $$ begin
  if not exists (select 1 from pg_type where typname = 'tenant_status') then
    create type public.tenant_status as enum (
      'draft', 'provisioning', 'active', 'suspended', 'archived'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'tenant_billing_status') then
    create type public.tenant_billing_status as enum (
      'trialing', 'active', 'past_due', 'canceled', 'manual_review'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'tenant_backend_kind') then
    create type public.tenant_backend_kind as enum (
      'supabase'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'tenant_connection_status') then
    create type public.tenant_connection_status as enum (
      'pending', 'ready', 'error'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'tenant_view_event_type') then
    create type public.tenant_view_event_type as enum (
      'enter', 'exit'
    );
  end if;
end $$;

-- app_role is used by tenant_view_audit_logs to record which role the staff
-- member was impersonating when they entered a tenant view.
do $$ begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum (
      'church_admin', 'pastor', 'ministry_leader', 'member'
    );
  end if;
end $$;

-- ─── Platform identity ─────────────────────────────────────
-- Links to control-plane auth.users — not the tenant auth project.
-- Only platform staff have accounts here.

create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      citext unique,
  full_name  text,
  avatar_url text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-provision a platform profile when a staff user signs up.
create or replace function public.handle_new_platform_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update
  set
    email      = excluded.email,
    full_name  = coalesce(excluded.full_name, public.profiles.full_name),
    avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url);
  return new;
end;
$$;

drop trigger if exists on_platform_user_created on auth.users;
create trigger on_platform_user_created
  after insert on auth.users
  for each row execute function public.handle_new_platform_user();

-- ─── Platform admins ───────────────────────────────────────

create table if not exists public.platform_admins (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now())
);

-- RLS helper: is the current authenticated user a platform admin?
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.platform_admins
    where user_id = auth.uid()
  );
$$;

-- ─── Tenant registry ───────────────────────────────────────

create table if not exists public.tenants (
  id                  uuid primary key default gen_random_uuid(),
  -- external_tenant_id is the church UUID in the tenant runtime DB.
  external_tenant_id  uuid unique,
  name                text not null,
  slug                citext not null unique,
  timezone            text not null default 'America/New_York',
  tenant_status       public.tenant_status         not null default 'draft',
  billing_status      public.tenant_billing_status not null default 'trialing',
  created_at          timestamptz not null default timezone('utc', now()),
  updated_at          timestamptz not null default timezone('utc', now())
);

create index if not exists tenants_external_tenant_id_idx
  on public.tenants (external_tenant_id);
create index if not exists tenants_tenant_status_idx
  on public.tenants (tenant_status);
create index if not exists tenants_billing_status_idx
  on public.tenants (billing_status);

drop trigger if exists set_tenants_updated_at on public.tenants;
create trigger set_tenants_updated_at
  before update on public.tenants
  for each row execute function public.set_updated_at();

-- ─── Tenant connections ────────────────────────────────────
-- Stores the backend endpoint and routing metadata for each tenant.
-- In the split architecture this is the authoritative source for how the
-- application reaches each tenant's runtime database.

create table if not exists public.tenant_connections (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null unique references public.tenants (id) on delete cascade,
  backend_kind      public.tenant_backend_kind       not null default 'supabase',
  project_url       text,
  db_url            text,
  connection_status public.tenant_connection_status not null default 'pending',
  -- metadata holds runtime routing fields: runtime_church_id, runtime_slug, etc.
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default timezone('utc', now()),
  updated_at        timestamptz not null default timezone('utc', now())
);

create index if not exists tenant_connections_connection_status_idx
  on public.tenant_connections (connection_status);

drop trigger if exists set_tenant_connections_updated_at on public.tenant_connections;
create trigger set_tenant_connections_updated_at
  before update on public.tenant_connections
  for each row execute function public.set_updated_at();

-- ─── Tenant-view audit log ─────────────────────────────────
-- Records when a platform staff member enters or exits a tenant (church) view.
-- church_id references a church in the TENANT runtime DB — no FK constraint
-- because that table lives in a different database.

create table if not exists public.tenant_view_audit_logs (
  id             uuid primary key default gen_random_uuid(),
  actor_user_id  uuid not null references public.profiles (id) on delete cascade,
  -- Soft reference to tenant DB public.churches.id
  church_id      uuid not null,
  viewed_role    public.app_role not null,
  event_type     public.tenant_view_event_type not null,
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default timezone('utc', now())
);

create index if not exists tenant_view_audit_actor_idx
  on public.tenant_view_audit_logs (actor_user_id);
create index if not exists tenant_view_audit_church_idx
  on public.tenant_view_audit_logs (church_id);
create index if not exists tenant_view_audit_created_at_idx
  on public.tenant_view_audit_logs (created_at desc);

-- ─── Row-level security ────────────────────────────────────

alter table public.profiles              enable row level security;
alter table public.platform_admins       enable row level security;
alter table public.tenants               enable row level security;
alter table public.tenant_connections    enable row level security;
alter table public.tenant_view_audit_logs enable row level security;

-- profiles: read own record; platform admins read all
create policy "profiles_select_self"
  on public.profiles for select to authenticated
  using (id = auth.uid());

create policy "profiles_select_platform_admin"
  on public.profiles for select to authenticated
  using (public.is_platform_admin());

create policy "profiles_update_self"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- platform_admins: read own row; insert only via service role
create policy "platform_admins_select_self"
  on public.platform_admins for select to authenticated
  using (user_id = auth.uid());

-- tenants: platform admins only
create policy "tenants_select_platform_admin"
  on public.tenants for select to authenticated
  using (public.is_platform_admin());

create policy "tenants_manage_platform_admin"
  on public.tenants for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- tenant_connections: platform admins only
create policy "tenant_connections_select_platform_admin"
  on public.tenant_connections for select to authenticated
  using (public.is_platform_admin());

create policy "tenant_connections_manage_platform_admin"
  on public.tenant_connections for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- tenant_view_audit_logs: platform admins read all; insert own events
create policy "tenant_view_audit_select_platform_admin"
  on public.tenant_view_audit_logs for select to authenticated
  using (public.is_platform_admin());

create policy "tenant_view_audit_insert_platform_admin_self"
  on public.tenant_view_audit_logs for insert to authenticated
  with check (
    public.is_platform_admin()
    and actor_user_id = auth.uid()
  );
