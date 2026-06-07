-- Security M-2: erase_profile_pii procedure
-- Atomically erases all PII for a profile. church_admin only.
-- Anonymizes donations (preserves financial record).
-- Writes ERASE row to audit_log.
-- Called exclusively from the eraseProfileData() server action via service_role.

create or replace function public.erase_profile_pii(
  target_profile_id uuid,
  actor_profile_id  uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
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

  select (
    public.is_platform_admin()
    or exists (
      select 1
      from public.church_memberships m
      where m.church_id = target_church_id
        and m.user_id   = (select user_id from public.profiles where id = actor_profile_id limit 1)
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
    (select user_id from public.profiles where id = actor_profile_id limit 1),
    target_church_id,
    'church_admin',
    jsonb_build_object(
      'erased_at',        timezone('utc', now()),
      'actor_profile_id', actor_profile_id,
      'church_id',        target_church_id
    )
  );
end;
$$;

revoke execute on function public.erase_profile_pii(uuid, uuid) from public;
revoke execute on function public.erase_profile_pii(uuid, uuid) from authenticated;
grant  execute on function public.erase_profile_pii(uuid, uuid) to service_role;
