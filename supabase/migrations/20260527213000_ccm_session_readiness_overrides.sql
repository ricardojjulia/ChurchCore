-- Session enablement readiness overrides and close-token invalidation support for Finding 2B.

alter table public.ccm_services
  add column if not exists checkin_session_override_reason text,
  add column if not exists checkin_session_override_by uuid references auth.users(id),
  add column if not exists checkin_session_override_at timestamptz;

create table if not exists public.ccm_session_enablement_overrides (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  service_id uuid not null references public.ccm_services(id) on delete cascade,
  override_reason text not null,
  readiness_snapshot jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists ccm_session_enablement_overrides_service_idx
  on public.ccm_session_enablement_overrides (service_id, created_at desc);

alter table public.ccm_session_enablement_overrides enable row level security;

drop policy if exists "ccm_session_enablement_overrides_mgr_all" on public.ccm_session_enablement_overrides;
create policy "ccm_session_enablement_overrides_mgr_all"
  on public.ccm_session_enablement_overrides
  for all
  using (public.can_manage_church(church_id))
  with check (public.can_manage_church(church_id));
