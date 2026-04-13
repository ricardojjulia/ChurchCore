-- ============================================================
-- Profile Merge Foundation
-- Ref: churchgoer_data.md
-- Adds: soft-merge columns and merge_duplicate_profile function
-- ============================================================

alter table public.profiles
  add column if not exists merged_into_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists merged_at timestamptz;

create index if not exists profiles_merged_at_idx
  on public.profiles (merged_at);

create or replace function public.merge_duplicate_profile(
  source_profile_id uuid,
  target_profile_id uuid,
  actor_profile_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  source_profile public.profiles%rowtype;
  target_profile public.profiles%rowtype;
  actor_can_manage boolean;
begin
  if source_profile_id is null or target_profile_id is null then
    raise exception 'Source and target profiles are required.';
  end if;

  if source_profile_id = target_profile_id then
    raise exception 'Source and target profiles must be different.';
  end if;

  select *
  into source_profile
  from public.profiles
  where id = source_profile_id;

  select *
  into target_profile
  from public.profiles
  where id = target_profile_id;

  if source_profile.id is null or target_profile.id is null then
    raise exception 'Source or target profile was not found.';
  end if;

  if source_profile.church_id is distinct from target_profile.church_id then
    raise exception 'Profiles must belong to the same church.';
  end if;

  if source_profile.merged_at is not null then
    raise exception 'Source profile has already been merged.';
  end if;

  if source_profile.role in ('church_admin', 'pastor')
     or target_profile.role in ('church_admin', 'pastor') then
    raise exception 'Privileged staff profiles cannot be merged with this tool.';
  end if;

  select exists (
    select 1
    from public.church_memberships membership
    where membership.church_id = target_profile.church_id
      and membership.user_id = actor_profile_id
      and membership.is_active
      and membership.role in ('church_admin', 'pastor')
  )
  into actor_can_manage;

  if not actor_can_manage then
    raise exception 'Only church admins or pastors can merge duplicate profiles.';
  end if;

  update public.profiles
  set
    full_name = coalesce(target_profile.full_name, source_profile.full_name),
    email = coalesce(target_profile.email, source_profile.email),
    phone = coalesce(target_profile.phone, source_profile.phone),
    address = coalesce(target_profile.address, source_profile.address),
    display_title = coalesce(target_profile.display_title, source_profile.display_title),
    preferred_contact_method = coalesce(target_profile.preferred_contact_method, source_profile.preferred_contact_method),
    emergency_contact_name = coalesce(target_profile.emergency_contact_name, source_profile.emergency_contact_name),
    emergency_contact_phone = coalesce(target_profile.emergency_contact_phone, source_profile.emergency_contact_phone),
    family_id = coalesce(target_profile.family_id, source_profile.family_id),
    directory_visible = coalesce(target_profile.directory_visible, false) or coalesce(source_profile.directory_visible, false),
    contact_allowed = coalesce(target_profile.contact_allowed, false) or coalesce(source_profile.contact_allowed, false),
    updated_at = timezone('utc', now())
  where id = target_profile_id;

  insert into public.profile_ministries (profile_id, ministry_id)
  select target_profile_id, profile_ministry.ministry_id
  from public.profile_ministries profile_ministry
  where profile_ministry.profile_id = source_profile_id
  on conflict (profile_id, ministry_id) do nothing;

  delete from public.profile_ministries
  where profile_id = source_profile_id;

  update public.attendance
  set profile_id = target_profile_id
  where profile_id = source_profile_id;

  update public.consent_logs
  set profile_id = target_profile_id
  where profile_id = source_profile_id;

  update public.pastoral_notes
  set profile_id = target_profile_id
  where profile_id = source_profile_id;

  update public.pastoral_notes
  set created_by = target_profile_id
  where created_by = source_profile_id;

  update public.care_assignments
  set profile_id = target_profile_id
  where profile_id = source_profile_id;

  update public.care_assignments
  set created_by = target_profile_id
  where created_by = source_profile_id;

  update public.care_assignments
  set assigned_to = target_profile_id
  where assigned_to = source_profile_id;

  insert into public.event_rsvps (event_id, user_id, status, note, created_at, updated_at)
  select
    event_rsvp.event_id,
    target_profile_id,
    event_rsvp.status,
    event_rsvp.note,
    event_rsvp.created_at,
    event_rsvp.updated_at
  from public.event_rsvps event_rsvp
  where event_rsvp.user_id = source_profile_id
  on conflict (event_id, user_id) do nothing;

  delete from public.event_rsvps
  where user_id = source_profile_id;

  if exists (
    select 1
    from public.volunteer_profiles volunteer_profile
    where volunteer_profile.church_id = source_profile.church_id
      and volunteer_profile.user_id = target_profile_id
  ) then
    delete from public.volunteer_profiles
    where church_id = source_profile.church_id
      and user_id = source_profile_id;
  else
    update public.volunteer_profiles
    set user_id = target_profile_id
    where church_id = source_profile.church_id
      and user_id = source_profile_id;
  end if;

  update public.volunteer_shifts
  set assigned_user_id = target_profile_id
  where assigned_user_id = source_profile_id;

  update public.ministries
  set leader_profile_id = target_profile_id
  where leader_profile_id = source_profile_id;

  update public.events
  set created_by = target_profile_id
  where created_by = source_profile_id;

  update public.church_memberships
  set
    is_active = false,
    updated_at = timezone('utc', now())
  where church_id = source_profile.church_id
    and user_id = source_profile_id;

  update public.profiles
  set
    merged_into_profile_id = target_profile_id,
    merged_at = timezone('utc', now()),
    family_id = null,
    directory_visible = false,
    contact_allowed = false,
    updated_at = timezone('utc', now())
  where id = source_profile_id;
end;
$$;
