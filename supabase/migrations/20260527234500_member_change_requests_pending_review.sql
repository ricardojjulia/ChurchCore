-- Member self-service profile/family updates that require staff review.
create table if not exists public.member_change_requests (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  target_profile_id uuid not null references public.profiles(id) on delete cascade,
  requested_by_profile_id uuid references public.profiles(id) on delete set null,
  change_type text not null check (change_type in ('profile', 'family')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  proposed_changes jsonb not null default '{}'::jsonb,
  reviewer_profile_id uuid references public.profiles(id) on delete set null,
  reviewer_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_member_change_requests_church_status
  on public.member_change_requests (church_id, status, change_type);

create index if not exists idx_member_change_requests_target_profile
  on public.member_change_requests (target_profile_id, created_at desc);

create unique index if not exists ux_member_change_requests_pending_target_type
  on public.member_change_requests (church_id, target_profile_id, change_type)
  where status = 'pending';

alter table public.member_change_requests enable row level security;

-- Members can read their own requests; managers can read all in church scope.
create policy member_change_requests_select_scope on public.member_change_requests
for select
using (
  can_manage_church(church_id)
  or exists (
    select 1
    from public.profiles p
    where p.id = member_change_requests.target_profile_id
      and p.user_id = auth.uid()
      and p.church_id = member_change_requests.church_id
      and p.merged_at is null
  )
);

-- Members can create requests only for their own profile in church scope.
create policy member_change_requests_insert_self on public.member_change_requests
for insert
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = member_change_requests.target_profile_id
      and p.user_id = auth.uid()
      and p.church_id = member_change_requests.church_id
      and p.merged_at is null
  )
);

-- Church managers review and update request state.
create policy member_change_requests_update_manage_scope on public.member_change_requests
for update
using (can_manage_church(church_id))
with check (can_manage_church(church_id));
