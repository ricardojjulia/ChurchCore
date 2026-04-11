create extension if not exists pgcrypto;
create extension if not exists citext;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'app_role'
  ) then
    create type public.app_role as enum (
      'church_admin',
      'pastor',
      'ministry_leader',
      'member'
    );
  end if;

  if not exists (
    select 1
    from pg_type
    where typname = 'approval_status'
  ) then
    create type public.approval_status as enum (
      'draft',
      'pending',
      'approved',
      'archived'
    );
  end if;

  if not exists (
    select 1
    from pg_type
    where typname = 'rsvp_status'
  ) then
    create type public.rsvp_status as enum (
      'yes',
      'no',
      'maybe'
    );
  end if;

  if not exists (
    select 1
    from pg_type
    where typname = 'volunteer_shift_status'
  ) then
    create type public.volunteer_shift_status as enum (
      'open',
      'assigned',
      'confirmed',
      'completed',
      'cancelled'
    );
  end if;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email citext unique,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.platform_admins (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.churches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug citext not null unique,
  timezone text not null default 'America/New_York',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.church_memberships (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.app_role not null,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (church_id, user_id, role)
);

create table if not exists public.ministries (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches (id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (church_id, slug)
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches (id) on delete cascade,
  ministry_id uuid references public.ministries (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  title text not null,
  description text,
  location text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity integer,
  approval_status public.approval_status not null default 'draft',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (ends_at > starts_at)
);

create table if not exists public.event_rsvps (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status public.rsvp_status not null,
  note text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (event_id, user_id)
);

create table if not exists public.volunteer_profiles (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  skills text[] not null default '{}',
  availability jsonb not null default '{}'::jsonb,
  training jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (church_id, user_id)
);

create table if not exists public.volunteer_shifts (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  ministry_id uuid references public.ministries (id) on delete set null,
  assigned_user_id uuid references public.profiles (id) on delete set null,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.volunteer_shift_status not null default 'open',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (ends_at > starts_at)
);

create index if not exists church_memberships_user_id_idx
  on public.church_memberships (user_id);

create index if not exists ministries_church_id_idx
  on public.ministries (church_id);

create index if not exists events_church_id_idx
  on public.events (church_id);

create index if not exists events_starts_at_idx
  on public.events (starts_at);

create index if not exists volunteer_shifts_event_id_idx
  on public.volunteer_shifts (event_id);

create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

create trigger set_churches_updated_at
before update on public.churches
for each row
execute function public.set_updated_at();

create trigger set_memberships_updated_at
before update on public.church_memberships
for each row
execute function public.set_updated_at();

create trigger set_ministries_updated_at
before update on public.ministries
for each row
execute function public.set_updated_at();

create trigger set_events_updated_at
before update on public.events
for each row
execute function public.set_updated_at();

create trigger set_event_rsvps_updated_at
before update on public.event_rsvps
for each row
execute function public.set_updated_at();

create trigger set_volunteer_profiles_updated_at
before update on public.volunteer_profiles
for each row
execute function public.set_updated_at();

create trigger set_volunteer_shifts_updated_at
before update on public.volunteer_shifts
for each row
execute function public.set_updated_at();

create or replace function public.handle_new_user()
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
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.platform_admins platform_admin
    where platform_admin.user_id = auth.uid()
  );
$$;

create or replace function public.belongs_to_church(target_church uuid)
returns boolean
language sql
stable
as $$
  select
    public.is_platform_admin()
    or exists (
      select 1
      from public.church_memberships membership
      where membership.church_id = target_church
        and membership.user_id = auth.uid()
        and membership.is_active
    );
$$;

create or replace function public.can_manage_church(target_church uuid)
returns boolean
language sql
stable
as $$
  select
    public.is_platform_admin()
    or exists (
      select 1
      from public.church_memberships membership
      where membership.church_id = target_church
        and membership.user_id = auth.uid()
        and membership.is_active
        and membership.role in ('church_admin', 'pastor', 'ministry_leader')
    );
$$;

alter table public.profiles enable row level security;
alter table public.platform_admins enable row level security;
alter table public.churches enable row level security;
alter table public.church_memberships enable row level security;
alter table public.ministries enable row level security;
alter table public.events enable row level security;
alter table public.event_rsvps enable row level security;
alter table public.volunteer_profiles enable row level security;
alter table public.volunteer_shifts enable row level security;

create policy "profiles_select_self"
on public.profiles
for select
to authenticated
using (id = auth.uid());

create policy "profiles_update_self"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "platform_admins_select_self"
on public.platform_admins
for select
to authenticated
using (user_id = auth.uid());

create policy "churches_select_member_scope"
on public.churches
for select
to authenticated
using (public.belongs_to_church(id));

create policy "churches_insert_platform_admin"
on public.churches
for insert
to authenticated
with check (public.is_platform_admin());

create policy "churches_update_management_scope"
on public.churches
for update
to authenticated
using (public.can_manage_church(id))
with check (public.can_manage_church(id));

create policy "memberships_select_member_scope"
on public.church_memberships
for select
to authenticated
using (public.belongs_to_church(church_id));

create policy "memberships_manage_management_scope"
on public.church_memberships
for all
to authenticated
using (public.can_manage_church(church_id))
with check (public.can_manage_church(church_id));

create policy "ministries_select_member_scope"
on public.ministries
for select
to authenticated
using (public.belongs_to_church(church_id));

create policy "ministries_manage_management_scope"
on public.ministries
for all
to authenticated
using (public.can_manage_church(church_id))
with check (public.can_manage_church(church_id));

create policy "events_select_member_scope"
on public.events
for select
to authenticated
using (public.belongs_to_church(church_id));

create policy "events_manage_management_scope"
on public.events
for all
to authenticated
using (public.can_manage_church(church_id))
with check (public.can_manage_church(church_id));

create policy "rsvps_select_member_scope"
on public.event_rsvps
for select
to authenticated
using (
  exists (
    select 1
    from public.events event
    where event.id = event_rsvps.event_id
      and public.belongs_to_church(event.church_id)
  )
);

create policy "rsvps_manage_self_or_management_scope"
on public.event_rsvps
for all
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.events event
    where event.id = event_rsvps.event_id
      and public.can_manage_church(event.church_id)
  )
)
with check (
  user_id = auth.uid()
  or exists (
    select 1
    from public.events event
    where event.id = event_rsvps.event_id
      and public.can_manage_church(event.church_id)
  )
);

create policy "volunteer_profiles_select_member_scope"
on public.volunteer_profiles
for select
to authenticated
using (public.belongs_to_church(church_id));

create policy "volunteer_profiles_manage_management_scope"
on public.volunteer_profiles
for all
to authenticated
using (public.can_manage_church(church_id))
with check (public.can_manage_church(church_id));

create policy "volunteer_shifts_select_member_scope"
on public.volunteer_shifts
for select
to authenticated
using (public.belongs_to_church(church_id));

create policy "volunteer_shifts_manage_management_scope"
on public.volunteer_shifts
for all
to authenticated
using (public.can_manage_church(church_id))
with check (public.can_manage_church(church_id));
