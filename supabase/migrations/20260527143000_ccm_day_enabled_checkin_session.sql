-- Day-enabled children check-in session lifecycle for Finding 2B.

alter table public.ccm_services
  add column if not exists checkin_session_status text not null default 'draft'
    check (checkin_session_status in ('draft', 'enabled', 'paused', 'closed')),
  add column if not exists checkin_session_starts_at timestamptz,
  add column if not exists checkin_session_ends_at timestamptz,
  add column if not exists checkin_session_token text not null default gen_random_uuid()::text,
  add column if not exists checkin_session_enabled_at timestamptz,
  add column if not exists checkin_session_closed_at timestamptz;

create unique index if not exists ccm_services_checkin_session_token_idx
  on public.ccm_services (checkin_session_token);

update public.ccm_services
set
  checkin_session_status = case
    when status = 'open' then 'enabled'
    else 'closed'
  end,
  checkin_session_enabled_at = case
    when status = 'open' then coalesce(checkin_session_enabled_at, started_at)
    else checkin_session_enabled_at
  end,
  checkin_session_closed_at = case
    when status = 'closed' then coalesce(checkin_session_closed_at, ended_at, timezone('utc', now()))
    else checkin_session_closed_at
  end
where checkin_session_status = 'draft';