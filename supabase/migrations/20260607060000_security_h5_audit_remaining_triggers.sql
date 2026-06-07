-- Security H-5 follow-up: populate church_id + actor_role in the three audit
-- trigger functions that were fixed for actor_id column naming but were not
-- updated when 20260607030000 added church_id and actor_role to audit_log.
--
-- Without this fix every row written by these triggers has church_id IS NULL,
-- which makes them invisible to church admins under the H-5 SELECT policy
-- (audit_log_select_church_admin requires church_id IS NOT NULL).
--
-- Functions updated:
--   1. audit_mentorship_pairs()          — mentorship_pairs table
--   2. audit_children_sensitive_access() — children_sensitive_data table
--   3. audit_ccm_access()                — generic CCM tables (tg_table_name)

-- ── 1. audit_mentorship_pairs ─────────────────────────────────────────────────

create or replace function public.audit_mentorship_pairs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_church_id uuid;
  resolved_role text;
begin
  row_church_id := coalesce(
    (to_jsonb(coalesce(new, old)) ->> 'church_id')::uuid,
    null
  );

  if row_church_id is not null and auth.uid() is not null then
    select role::text
    into resolved_role
    from public.church_memberships
    where church_id = row_church_id
      and user_id   = auth.uid()
      and is_active
    limit 1;
  end if;

  insert into public.audit_log (table_name, record_id, operation, actor_id, church_id, actor_role, changed_at)
  values (
    'mentorship_pairs',
    coalesce(new.id, old.id),
    tg_op,
    auth.uid(),
    row_church_id,
    resolved_role,
    timezone('utc', now())
  );
  return coalesce(new, old);
end;
$$;

-- ── 2. audit_children_sensitive_access ───────────────────────────────────────

create or replace function public.audit_children_sensitive_access()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_church_id uuid;
  resolved_role text;
begin
  row_church_id := coalesce(
    (to_jsonb(coalesce(new, old)) ->> 'church_id')::uuid,
    null
  );

  if row_church_id is not null and auth.uid() is not null then
    select role::text
    into resolved_role
    from public.church_memberships
    where church_id = row_church_id
      and user_id   = auth.uid()
      and is_active
    limit 1;
  end if;

  insert into public.audit_log (table_name, record_id, operation, actor_id, church_id, actor_role, changed_at)
  values (
    'children_sensitive_data',
    coalesce(new.id, old.id),
    tg_op,
    auth.uid(),
    row_church_id,
    resolved_role,
    timezone('utc', now())
  );
  return coalesce(new, old);
end;
$$;

-- ── 3. audit_ccm_access ───────────────────────────────────────────────────────

create or replace function public.audit_ccm_access()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_church_id uuid;
  resolved_role text;
begin
  row_church_id := coalesce(
    (to_jsonb(coalesce(new, old)) ->> 'church_id')::uuid,
    null
  );

  if row_church_id is not null and auth.uid() is not null then
    select role::text
    into resolved_role
    from public.church_memberships
    where church_id = row_church_id
      and user_id   = auth.uid()
      and is_active
    limit 1;
  end if;

  insert into public.audit_log (table_name, record_id, operation, actor_id, church_id, actor_role, changed_at)
  values (
    tg_table_name,
    coalesce(new.id, old.id),
    tg_op,
    auth.uid(),
    row_church_id,
    resolved_role,
    timezone('utc', now())
  );
  return coalesce(new, old);
end;
$$;
