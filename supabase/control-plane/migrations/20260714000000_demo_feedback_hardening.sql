alter table public.demo_feedback
  add column if not exists session_duration_seconds integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'demo_feedback_session_duration_nonnegative'
      and conrelid = 'public.demo_feedback'::regclass
  ) then
    alter table public.demo_feedback
      add constraint demo_feedback_session_duration_nonnegative
      check (
        session_duration_seconds is null
        or session_duration_seconds between 0 and 2592000
      );
  end if;
end
$$;

create table if not exists public.demo_feedback_rate_limits (
  session_key_hash text primary key,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.demo_feedback_rate_limits enable row level security;

-- Keep the original RPC temporarily for rolling-deploy compatibility, but
-- remove definer rights and browser execution.
alter function public.upsert_demo_feedback(
  text, text, text, text, text, text, jsonb, text, text, text, jsonb
) security invoker;

revoke all on function public.upsert_demo_feedback(
  text, text, text, text, text, text, jsonb, text, text, text, jsonb
) from public, anon, authenticated;

grant execute on function public.upsert_demo_feedback(
  text, text, text, text, text, text, jsonb, text, text, text, jsonb
) to service_role;

grant select, insert, update, delete
  on table public.demo_feedback_rate_limits
  to service_role;

grant select, insert, update
  on table public.demo_feedback
  to service_role;

create or replace function public.submit_demo_feedback(
  p_session_key_hash text,
  p_fingerprint text,
  p_session_id text,
  p_route text,
  p_category text,
  p_error_message text,
  p_note text,
  p_breadcrumbs jsonb,
  p_user_email text,
  p_user_role text,
  p_demo_version text,
  p_session_duration_seconds integer,
  p_metadata jsonb
) returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_window_started_at timestamptz;
  v_request_count integer;
  v_now timestamptz := now();
begin
  -- Serialize submissions for the same hashed session across all app instances.
  perform pg_advisory_xact_lock(hashtextextended(p_session_key_hash, 0));

  select window_started_at, request_count
    into v_window_started_at, v_request_count
  from public.demo_feedback_rate_limits
  where session_key_hash = p_session_key_hash;

  if not found then
    insert into public.demo_feedback_rate_limits (
      session_key_hash,
      window_started_at,
      request_count,
      updated_at
    ) values (
      p_session_key_hash,
      v_now,
      1,
      v_now
    );
  elsif v_window_started_at <= v_now - interval '60 seconds' then
    update public.demo_feedback_rate_limits
    set window_started_at = v_now,
        request_count = 1,
        updated_at = v_now
    where session_key_hash = p_session_key_hash;
  elsif v_request_count >= 20 then
    return false;
  else
    update public.demo_feedback_rate_limits
    set request_count = request_count + 1,
        updated_at = v_now
    where session_key_hash = p_session_key_hash;
  end if;

  insert into public.demo_feedback (
    fingerprint,
    session_id,
    route,
    category,
    error_message,
    note,
    breadcrumbs,
    user_email,
    user_role,
    demo_version,
    session_duration_seconds,
    metadata,
    hit_count
  ) values (
    p_fingerprint,
    p_session_id,
    p_route,
    p_category,
    p_error_message,
    p_note,
    p_breadcrumbs,
    p_user_email,
    p_user_role,
    p_demo_version,
    p_session_duration_seconds,
    p_metadata,
    1
  )
  on conflict (fingerprint) do update
  set hit_count = public.demo_feedback.hit_count + 1,
      session_id = excluded.session_id,
      route = excluded.route,
      error_message = coalesce(excluded.error_message, public.demo_feedback.error_message),
      note = coalesce(excluded.note, public.demo_feedback.note),
      breadcrumbs = excluded.breadcrumbs,
      user_email = excluded.user_email,
      user_role = excluded.user_role,
      demo_version = excluded.demo_version,
      session_duration_seconds = excluded.session_duration_seconds,
      metadata = excluded.metadata,
      processed = false,
      action = null,
      updated_at = v_now;

  -- Bound storage without retaining raw session identifiers in the limiter table.
  delete from public.demo_feedback_rate_limits
  where updated_at < v_now - interval '24 hours'
    and session_key_hash <> p_session_key_hash;

  return true;
end;
$$;

revoke all on function public.submit_demo_feedback(
  text, text, text, text, text, text, text, jsonb, text, text, text, integer, jsonb
) from public, anon, authenticated;

grant execute on function public.submit_demo_feedback(
  text, text, text, text, text, text, text, jsonb, text, text, text, integer, jsonb
) to service_role;
