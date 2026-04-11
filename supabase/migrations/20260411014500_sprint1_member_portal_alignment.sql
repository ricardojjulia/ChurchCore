alter table public.profiles
  add column if not exists user_id uuid,
  add column if not exists church_id uuid,
  add column if not exists phone text,
  add column if not exists address text,
  add column if not exists role text,
  add column if not exists display_title text,
  add column if not exists is_pastoral boolean not null default false;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_user_id_fkey'
  ) then
    alter table public.profiles
      add constraint profiles_user_id_fkey
      foreign key (user_id) references auth.users (id) on delete cascade;
  end if;
end $$;

update public.profiles
set user_id = id
where user_id is null;

alter table public.profiles
  alter column user_id set not null;

create unique index if not exists profiles_user_id_uidx
  on public.profiles (user_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_church_id_fkey'
  ) then
    alter table public.profiles
      add constraint profiles_church_id_fkey
      foreign key (church_id) references public.churches (id) on delete set null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_role_check'
  ) then
    alter table public.profiles
      add constraint profiles_role_check
      check (
        role is null
        or role in ('church_admin', 'pastor_elder', 'ministry_leader', 'member_volunteer')
      );
  end if;
end $$;

update public.profiles profile
set
  church_id = membership_snapshot.church_id,
  role = membership_snapshot.role,
  is_pastoral = membership_snapshot.is_pastoral
from (
  select distinct on (membership.user_id)
    membership.user_id,
    membership.church_id,
    case membership.role
      when 'church_admin' then 'church_admin'
      when 'pastor' then 'pastor_elder'
      when 'ministry_leader' then 'ministry_leader'
      else 'member_volunteer'
    end as role,
    membership.role = 'pastor' as is_pastoral
  from public.church_memberships membership
  where membership.is_active
  order by membership.user_id, membership.created_at asc
) as membership_snapshot
where profile.user_id = membership_snapshot.user_id;

update public.profiles
set role = coalesce(role, 'member_volunteer'),
    is_pastoral = coalesce(is_pastoral, false);

create index if not exists profiles_church_id_idx
  on public.profiles (church_id);

create or replace function public.refresh_profile_membership_snapshot(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  membership_record record;
begin
  select
    membership.church_id,
    case membership.role
      when 'church_admin' then 'church_admin'
      when 'pastor' then 'pastor_elder'
      when 'ministry_leader' then 'ministry_leader'
      else 'member_volunteer'
    end as role,
    membership.role = 'pastor' as is_pastoral
  into membership_record
  from public.church_memberships membership
  where membership.user_id = target_user_id
    and membership.is_active
  order by membership.created_at asc
  limit 1;

  update public.profiles
  set
    user_id = coalesce(user_id, id),
    church_id = membership_record.church_id,
    role = coalesce(membership_record.role, 'member_volunteer'),
    is_pastoral = coalesce(membership_record.is_pastoral, false),
    updated_at = timezone('utc', now())
  where user_id = target_user_id
     or id = target_user_id;
end;
$$;

create or replace function public.handle_profile_membership_snapshot_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.user_id is not null then
    perform public.refresh_profile_membership_snapshot(old.user_id);
  end if;

  if tg_op in ('INSERT', 'UPDATE')
     and new.user_id is not null
     and (tg_op = 'INSERT' or new.user_id is distinct from old.user_id) then
    perform public.refresh_profile_membership_snapshot(new.user_id);
  end if;

  return coalesce(new, old);
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, user_id, email, full_name, avatar_url)
  values (
    new.id,
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update
  set
    user_id = excluded.user_id,
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url);

  return new;
end;
$$;

drop trigger if exists sync_profile_membership_snapshot_after_change on public.church_memberships;

create trigger sync_profile_membership_snapshot_after_change
after insert or update or delete on public.church_memberships
for each row
execute function public.handle_profile_membership_snapshot_sync();

alter table public.ministries
  add column if not exists leader_profile_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ministries_leader_profile_id_fkey'
  ) then
    alter table public.ministries
      add constraint ministries_leader_profile_id_fkey
      foreign key (leader_profile_id) references public.profiles (id) on delete set null;
  end if;
end $$;

create index if not exists ministries_leader_profile_id_idx
  on public.ministries (leader_profile_id);

create table if not exists public.profile_ministries (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  ministry_id uuid not null references public.ministries (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (profile_id, ministry_id)
);

alter table public.profile_ministries enable row level security;

create or replace function public.profile_belongs_to_same_church(profile_ref uuid, ministry_ref uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.profiles profile
    join public.ministries ministry
      on ministry.id = ministry_ref
    where profile.id = profile_ref
      and profile.church_id = ministry.church_id
  );
$$;

create policy "profile_ministries_select_member_scope"
on public.profile_ministries
for select
to authenticated
using (
  exists (
    select 1
    from public.ministries ministry
    where ministry.id = profile_ministries.ministry_id
      and public.belongs_to_church(ministry.church_id)
  )
);

create policy "profile_ministries_manage_management_scope"
on public.profile_ministries
for all
to authenticated
using (
  exists (
    select 1
    from public.ministries ministry
    where ministry.id = profile_ministries.ministry_id
      and public.can_manage_church(ministry.church_id)
  )
)
with check (
  public.profile_belongs_to_same_church(profile_ministries.profile_id, profile_ministries.ministry_id)
  and exists (
    select 1
    from public.ministries ministry
    where ministry.id = profile_ministries.ministry_id
      and public.can_manage_church(ministry.church_id)
  )
);

alter table public.events
  add column if not exists category text,
  add column if not exists visibility text,
  add column if not exists rsvp_enabled boolean not null default true;

update public.events
set
  category = coalesce(category, 'general'),
  visibility = coalesce(visibility, 'members'),
  rsvp_enabled = coalesce(rsvp_enabled, true);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'events_category_check'
  ) then
    alter table public.events
      add constraint events_category_check
      check (
        category in (
          'general',
          'informational',
          'administrative',
          'ministry',
          'internal',
          'liturgical',
          'prayer',
          'outreach',
          'worship'
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'events_visibility_check'
  ) then
    alter table public.events
      add constraint events_visibility_check
      check (visibility in ('public', 'members', 'leaders'));
  end if;
end $$;

alter table public.events
  alter column category set not null,
  alter column visibility set default 'members',
  alter column visibility set not null;

create index if not exists events_category_idx
  on public.events (church_id, category);

create index if not exists profile_ministries_ministry_id_idx
  on public.profile_ministries (ministry_id);

create policy "profiles_select_member_scope"
on public.profiles
for select
to authenticated
using (
  church_id is not null
  and public.belongs_to_church(church_id)
);

create policy "profiles_manage_management_scope"
on public.profiles
for all
to authenticated
using (
  church_id is not null
  and public.can_manage_church(church_id)
)
with check (
  church_id is not null
  and public.can_manage_church(church_id)
);
