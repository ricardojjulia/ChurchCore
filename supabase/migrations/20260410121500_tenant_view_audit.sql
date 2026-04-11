do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'tenant_view_event_type'
  ) then
    create type public.tenant_view_event_type as enum (
      'enter',
      'exit'
    );
  end if;
end $$;

create table if not exists public.tenant_view_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references public.profiles (id) on delete cascade,
  church_id uuid not null references public.churches (id) on delete cascade,
  viewed_role public.app_role not null,
  event_type public.tenant_view_event_type not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists tenant_view_audit_logs_actor_user_id_idx
  on public.tenant_view_audit_logs (actor_user_id);

create index if not exists tenant_view_audit_logs_church_id_idx
  on public.tenant_view_audit_logs (church_id);

create index if not exists tenant_view_audit_logs_created_at_idx
  on public.tenant_view_audit_logs (created_at desc);

alter table public.tenant_view_audit_logs enable row level security;

create policy "tenant_view_audit_logs_select_platform_admin"
on public.tenant_view_audit_logs
for select
to authenticated
using (public.is_platform_admin());

create policy "tenant_view_audit_logs_insert_platform_admin_self"
on public.tenant_view_audit_logs
for insert
to authenticated
with check (
  public.is_platform_admin()
  and actor_user_id = auth.uid()
);
