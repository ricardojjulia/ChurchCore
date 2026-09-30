-- Council Review 27: erase_profile_pii trusted its caller (ADR 0024).
--
-- SECURITY DEFINER, executable by anon, and it authorized the actor named in
-- its actor_profile_id argument: anyone with the public (anon) key could erase
-- any non-staff member's personal data by passing a church admin's profile id.
-- The actor is now auth.uid(), and anon can't execute it.
--
-- Also closed while sweeping SECURITY DEFINER functions:
-- - refresh_profile_membership_snapshot(target_user_id) rewrote any user's
--   profile snapshot for any caller, anon included. It's internal (called by
--   the membership sync trigger, which runs as the owner); no direct callers.
-- - generate_member_number() let anon consume member numbers. The app calls
--   it server-side only.

CREATE OR REPLACE FUNCTION public.erase_profile_pii(target_profile_id uuid, actor_profile_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  target_church_id uuid;
  actor_can_erase  boolean;
begin
  select church_id
  into target_church_id
  from public.profiles
  where id = target_profile_id;

  if target_church_id is null then
    raise exception 'Profile not found or has no church context: %', target_profile_id;
  end if;

  -- The actor is whoever is signed in (auth.uid()), never the caller's word:
  -- this trusted actor_profile_id, and was executable by anon, so anyone
  -- holding the public key could erase any member by naming a church admin's
  -- profile (Council Review 27, ADR 0024). actor_profile_id must be the
  -- caller's own profile.
  if auth.uid() is null then
    raise exception 'Only church admins may erase profile PII.';
  end if;

  if actor_profile_id is not null and not exists (
    select 1 from public.profiles actor
    where actor.id = actor_profile_id and actor.user_id = auth.uid()
  ) then
    raise exception 'Only church admins may erase profile PII.';
  end if;

  select (
    public.is_platform_admin()
    or exists (
      select 1
      from public.church_memberships m
      where m.church_id = target_church_id
        and m.user_id   = auth.uid()
        and m.role      = 'church_admin'
        and m.is_active
    )
  )
  into actor_can_erase;

  if not actor_can_erase then
    raise exception 'Only church admins may erase profile PII.';
  end if;

  if exists (
    select 1 from public.profiles
    where id = target_profile_id
      and role in ('church_admin', 'pastor_elder', 'pastor')
  ) then
    raise exception 'Privileged staff profiles cannot be erased with this tool. Deactivate the account first.';
  end if;

  update public.profiles
  set
    full_name                = '[Erased]',
    email                    = null,
    phone                    = null,
    address                  = null,
    avatar_url               = null,
    preferred_contact_method = null,
    directory_visible        = false,
    contact_allowed          = false,
    merged_at                = timezone('utc', now()),
    updated_at               = timezone('utc', now())
  where id = target_profile_id;

  delete from public.profile_sensitive_fields
  where profile_id = target_profile_id;

  delete from public.attendance
  where profile_id = target_profile_id;

  delete from public.pastoral_notes
  where profile_id = target_profile_id;

  delete from public.care_assignments
  where profile_id = target_profile_id;

  delete from public.consent_logs
  where profile_id = target_profile_id;

  update public.donations
  set
    donor_name  = '[Erased]',
    donor_email = null,
    note        = null,
    updated_at  = timezone('utc', now())
  where profile_id = target_profile_id;

  insert into public.audit_log (
    table_name,
    record_id,
    operation,
    actor_id,
    church_id,
    actor_role,
    new_values
  )
  values (
    'profiles',
    target_profile_id,
    'ERASE',
    auth.uid(),
    target_church_id,
    'church_admin',
    jsonb_build_object(
      'erased_at',        timezone('utc', now()),
      'actor_profile_id', actor_profile_id,
      'church_id',        target_church_id
    )
  );
end;
$function$;

revoke execute on function public.erase_profile_pii(uuid, uuid) from public, anon;
grant execute on function public.erase_profile_pii(uuid, uuid) to authenticated;

revoke execute on function public.refresh_profile_membership_snapshot(uuid) from public, anon, authenticated;

revoke execute on function public.generate_member_number() from public, anon;
grant execute on function public.generate_member_number() to authenticated;
