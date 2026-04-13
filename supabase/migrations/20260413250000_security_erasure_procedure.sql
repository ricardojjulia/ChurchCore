-- ============================================================
-- Security: GDPR right-to-erasure procedure
-- Ref: docs/security-assessment.md (M-2)
-- Ref: docs/security-mitigation-plan.md (P2-C)
--
-- erase_profile_pii(target_profile_id, actor_profile_id)
--
-- Nulls out all PII on a profile while preserving the row as
-- a tombstone (maintains FK integrity for events, shifts,
-- ministries, and other non-personal relational data).
--
-- Only church admins and platform admins may call this.
-- Every erasure is written to audit_log with operation=ERASE.
-- ============================================================

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
  -- Resolve the church for authorization check
  select church_id
  into target_church_id
  from public.profiles
  where id = target_profile_id;

  if target_church_id is null then
    raise exception 'Profile not found or has no church context: %', target_profile_id;
  end if;

  -- Only church admins and platform admins may erase
  select (
    public.is_platform_admin()
    or exists (
      select 1
      from public.church_memberships m
      where m.church_id  = target_church_id
        and m.user_id    = (
              select user_id from public.profiles where id = actor_profile_id limit 1
            )
        and m.role       in ('church_admin')
        and m.is_active
    )
  )
  into actor_can_erase;

  if not actor_can_erase then
    raise exception 'Only church admins may erase profile PII.';
  end if;

  -- Prevent erasing a pastor or church_admin profile via this tool
  if exists (
    select 1 from public.profiles
    where id = target_profile_id
      and role in ('church_admin', 'pastor_elder', 'pastor')
  ) then
    raise exception 'Privileged staff profiles cannot be erased with this tool. Deactivate the account first.';
  end if;

  -- ----------------------------------------------------------
  -- 1. Erase PII from profiles
  -- ----------------------------------------------------------
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

  -- ----------------------------------------------------------
  -- 2. Delete sensitive fields entirely
  -- ----------------------------------------------------------
  delete from public.profile_sensitive_fields
  where profile_id = target_profile_id;

  -- ----------------------------------------------------------
  -- 3. Delete attendance records
  -- ----------------------------------------------------------
  delete from public.attendance
  where profile_id = target_profile_id;

  -- ----------------------------------------------------------
  -- 4. Delete pastoral notes where person is the subject
  --    (keep notes where person is the author — those belong
  --     to the pastoral record of another person)
  -- ----------------------------------------------------------
  delete from public.pastoral_notes
  where profile_id = target_profile_id;

  -- ----------------------------------------------------------
  -- 5. Delete care assignments where person is the subject
  -- ----------------------------------------------------------
  delete from public.care_assignments
  where profile_id = target_profile_id;

  -- ----------------------------------------------------------
  -- 6. Delete consent logs
  -- ----------------------------------------------------------
  delete from public.consent_logs
  where profile_id = target_profile_id;

  -- ----------------------------------------------------------
  -- 7. Write erasure record to audit_log
  -- ----------------------------------------------------------
  insert into public.audit_log (
    table_name,
    record_id,
    operation,
    actor_id,
    new_values
  )
  values (
    'profiles',
    target_profile_id,
    'ERASE',
    (select user_id from public.profiles where id = actor_profile_id limit 1),
    jsonb_build_object(
      'erased_at',       timezone('utc', now()),
      'actor_profile_id', actor_profile_id,
      'church_id',       target_church_id
    )
  );
end;
$$;

-- Revoke public execute; only the app via service role calls this
revoke execute on function public.erase_profile_pii(uuid, uuid) from public;
revoke execute on function public.erase_profile_pii(uuid, uuid) from authenticated;
grant  execute on function public.erase_profile_pii(uuid, uuid) to service_role;
