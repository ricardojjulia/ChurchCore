-- Council Review 26: merge_duplicate_profile trusted its caller and mixed ids.
--
-- It's SECURITY DEFINER and was executable by anon and authenticated. Its
-- admin check compared church_memberships.user_id (a login id) with the
-- actor_profile_id argument (a profile id): every real admin failed it, and
-- anyone who passed an admin's *login* id as actor_profile_id passed it and
-- could merge (hide) any non-staff profile in that church. The actor is now
-- auth.uid(); actor_profile_id must be the caller's own profile; anon can no
-- longer execute it. The duplicate's sign-in moves to the kept profile (it was
-- left on the hidden duplicate), and two profiles that each have a sign-in
-- are refused. Emergency contacts are read
-- from profile_sensitive_fields, where they moved in April; the function still
-- read them off profiles, so every merge failed outright. And a kept profile
-- without an email took the duplicate's while it still held it, breaking
-- profiles_email_key.

CREATE OR REPLACE FUNCTION public.merge_duplicate_profile(source_profile_id uuid, target_profile_id uuid, actor_profile_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- The actor is whoever is signed in (auth.uid()), never the caller's word:
  -- church_memberships.user_id is a login id, and this compared it with a
  -- profile id, so real admins always failed while anyone passing an admin's
  -- login id passed. actor_profile_id is kept for the call signature and must
  -- be the signed-in person's own profile (Council Review 26).
  if auth.uid() is null then
    raise exception 'Only church admins or pastors can merge duplicate profiles.';
  end if;

  if actor_profile_id is not null and not exists (
    select 1 from public.profiles actor
    where actor.id = actor_profile_id and actor.user_id = auth.uid()
  ) then
    raise exception 'Only church admins or pastors can merge duplicate profiles.';
  end if;

  select exists (
    select 1
    from public.church_memberships membership
    where membership.church_id = target_profile.church_id
      and membership.user_id = auth.uid()
      and membership.is_active
      and membership.role in ('church_admin', 'pastor')
  )
  into actor_can_manage;

  if not actor_can_manage then
    raise exception 'Only church admins or pastors can merge duplicate profiles.';
  end if;

  -- One sign-in per person: two profiles that each have one are two people's
  -- accounts, not a duplicate this tool can resolve (owner decision 2026-09-30).
  if source_profile.user_id is not null and target_profile.user_id is not null then
    raise exception 'Both profiles have their own sign-in, so they can''t be merged with this tool.';
  end if;

  -- profiles.email is unique: when the kept profile takes the duplicate's
  -- email, the duplicate gives it up first, or the update fails (Council
  -- Review 26).
  if target_profile.email is null and source_profile.email is not null then
    update public.profiles set email = null where id = source_profile_id;
  end if;

  update public.profiles
  set
    full_name = coalesce(target_profile.full_name, source_profile.full_name),
    email = coalesce(target_profile.email, source_profile.email),
    phone = coalesce(target_profile.phone, source_profile.phone),
    address = coalesce(target_profile.address, source_profile.address),
    display_title = coalesce(target_profile.display_title, source_profile.display_title),
    preferred_contact_method = coalesce(target_profile.preferred_contact_method, source_profile.preferred_contact_method),
    family_id = coalesce(target_profile.family_id, source_profile.family_id),
    directory_visible = coalesce(target_profile.directory_visible, false) or coalesce(source_profile.directory_visible, false),
    contact_allowed = coalesce(target_profile.contact_allowed, false) or coalesce(source_profile.contact_allowed, false),
    updated_at = timezone('utc', now())
  where id = target_profile_id;

  -- Emergency contacts and date of birth moved to profile_sensitive_fields
  -- (20260413220000), but this function still read them off profiles, so every
  -- merge failed with "record has no field emergency_contact_name". Carry the
  -- duplicate's values over, filling only what the kept profile lacks
  -- (Council Review 26).
  insert into public.profile_sensitive_fields (profile_id, church_id, date_of_birth, emergency_contact_name, emergency_contact_phone)
  select target_profile_id, target_profile.church_id, source.date_of_birth, source.emergency_contact_name, source.emergency_contact_phone
  from public.profile_sensitive_fields source
  where source.profile_id = source_profile_id
  on conflict (profile_id) do update
  set
    date_of_birth = coalesce(profile_sensitive_fields.date_of_birth, excluded.date_of_birth),
    emergency_contact_name = coalesce(profile_sensitive_fields.emergency_contact_name, excluded.emergency_contact_name),
    emergency_contact_phone = coalesce(profile_sensitive_fields.emergency_contact_phone, excluded.emergency_contact_phone),
    updated_at = timezone('utc', now());

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

  -- The duplicate's sign-in moves to the kept profile, so the person keeps
  -- their access and profile (it used to stay on the hidden duplicate,
  -- leaving the login with no church profile). Memberships are keyed by the
  -- login, so they carry over unchanged (owner decision 2026-09-30).
  if source_profile.user_id is not null then
    update public.profiles set user_id = null where id = source_profile_id;
    update public.profiles set user_id = source_profile.user_id where id = target_profile_id;
  end if;

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
$function$;

revoke execute on function public.merge_duplicate_profile(uuid, uuid, uuid) from public, anon;
grant execute on function public.merge_duplicate_profile(uuid, uuid, uuid) to authenticated;
