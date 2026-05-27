-- Public children session attempt audit + rate limit support.

create table if not exists public.ccm_public_session_attempts (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  service_id uuid not null references public.ccm_services(id) on delete cascade,
  attempt_type text not null check (attempt_type in ('checkin', 'checkout')),
  session_token_hash text not null,
  fingerprint_hash text not null,
  success boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists ccm_public_session_attempts_rate_idx
  on public.ccm_public_session_attempts (
    service_id,
    attempt_type,
    session_token_hash,
    fingerprint_hash,
    created_at desc
  );

alter table public.ccm_public_session_attempts enable row level security;

drop policy if exists "ccm_public_attempts_mgr_all" on public.ccm_public_session_attempts;

create policy "ccm_public_attempts_mgr_all"
  on public.ccm_public_session_attempts
  for all
  using (public.can_manage_church(church_id));