-- Push notification subscriptions for web-push delivery
-- Each row is one browser/device subscription for a member.
-- Unique on (profile_id, endpoint) — re-subscribing from the same device upserts.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth_secret text not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (profile_id, endpoint)
);

create index push_subscriptions_church_idx on public.push_subscriptions (church_id);
create index push_subscriptions_profile_idx on public.push_subscriptions (profile_id);

alter table public.push_subscriptions enable row level security;

-- Members manage their own subscriptions
create policy "member_manage_own_push_subscriptions"
  on public.push_subscriptions
  using (
    profile_id = (
      select id from public.profiles
      where user_id = auth.uid()
        and church_id = push_subscriptions.church_id
      limit 1
    )
  )
  with check (
    profile_id = (
      select id from public.profiles
      where user_id = auth.uid()
        and church_id = push_subscriptions.church_id
      limit 1
    )
  );

-- Admins can read all subscriptions in their church (for dispatch)
create policy "admin_read_push_subscriptions"
  on public.push_subscriptions
  for select
  using (can_manage_church(church_id));
