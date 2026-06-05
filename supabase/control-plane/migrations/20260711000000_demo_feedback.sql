create table if not exists public.demo_feedback (
  id            uuid        primary key default gen_random_uuid(),
  fingerprint   text        not null,
  session_id    text        not null,
  route         text        not null,
  category      text        not null check (category in ('BUG','ERROR','UNEXPECTED_RESULT','IMPROVEMENT')),
  error_message text,
  note          text,
  breadcrumbs   jsonb       not null default '[]'::jsonb,
  user_email    text,
  user_role     text,
  demo_version  text        not null default '',
  hit_count     integer     not null default 1,
  metadata      jsonb       not null default '{}'::jsonb,
  created_at    timestamptz not null default timezone('utc', now()),
  updated_at    timestamptz not null default timezone('utc', now()),
  unique (fingerprint)
);

create index if not exists demo_feedback_route_idx       on public.demo_feedback (route);
create index if not exists demo_feedback_category_idx    on public.demo_feedback (category);
create index if not exists demo_feedback_session_id_idx  on public.demo_feedback (session_id);
create index if not exists demo_feedback_created_at_idx  on public.demo_feedback (created_at desc);

alter table public.demo_feedback enable row level security;

-- Only platform admins may read
create policy "demo_feedback_select_platform_admin"
  on public.demo_feedback for select to authenticated
  using (public.is_platform_admin());

-- Upsert function (single round-trip, handles hit_count increment atomically)
create or replace function public.upsert_demo_feedback(
  p_fingerprint   text,
  p_session_id    text,
  p_route         text,
  p_category      text,
  p_error_message text,
  p_note          text,
  p_breadcrumbs   jsonb,
  p_user_email    text,
  p_user_role     text,
  p_demo_version  text,
  p_metadata      jsonb
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.demo_feedback
    (fingerprint, session_id, route, category, error_message, note,
     breadcrumbs, user_email, user_role, demo_version, metadata, hit_count)
  values
    (p_fingerprint, p_session_id, p_route, p_category, p_error_message, p_note,
     p_breadcrumbs, p_user_email, p_user_role, p_demo_version, p_metadata, 1)
  on conflict (fingerprint) do update
    set hit_count  = demo_feedback.hit_count + 1,
        updated_at = timezone('utc', now());
end;
$$;

create trigger set_demo_feedback_updated_at
  before update on public.demo_feedback
  for each row execute function public.set_updated_at();
