-- Security H-5: audit_log — add church_id + actor_role; church_admin-only SELECT policy

-- 1. Add columns (idempotent)
alter table public.audit_log
  add column if not exists church_id  uuid references public.churches(id) on delete set null,
  add column if not exists actor_role text;

create index if not exists audit_log_church_id_idx
  on public.audit_log (church_id, changed_at desc);

-- 2. Church-admin-only scoped SELECT (NOT can_manage_church; explicit role check)
drop policy if exists "audit_log_select_church_admin" on public.audit_log;

create policy "audit_log_select_church_admin"
on public.audit_log
for select
to authenticated
using (
  church_id is not null
  and exists (
    select 1
    from public.church_memberships m
    where m.church_id = audit_log.church_id
      and m.user_id   = auth.uid()
      and m.role      = 'church_admin'
      and m.is_active
  )
);

-- 3. Updated generic audit trigger function
create or replace function public.audit_log_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  record_uuid   uuid;
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

  if tg_op = 'DELETE' then
    record_uuid := (to_jsonb(old) ->> 'id')::uuid;
    insert into public.audit_log
      (table_name, record_id, operation, actor_id, church_id, actor_role, old_values)
    values
      (tg_table_name, record_uuid, tg_op, auth.uid(), row_church_id, resolved_role, to_jsonb(old));
    return old;
  elsif tg_op = 'UPDATE' then
    record_uuid := (to_jsonb(new) ->> 'id')::uuid;
    insert into public.audit_log
      (table_name, record_id, operation, actor_id, church_id, actor_role, old_values, new_values)
    values
      (tg_table_name, record_uuid, tg_op, auth.uid(), row_church_id, resolved_role, to_jsonb(old), to_jsonb(new));
    return new;
  else
    record_uuid := (to_jsonb(new) ->> 'id')::uuid;
    insert into public.audit_log
      (table_name, record_id, operation, actor_id, church_id, actor_role, new_values)
    values
      (tg_table_name, record_uuid, tg_op, auth.uid(), row_church_id, resolved_role, to_jsonb(new));
    return new;
  end if;
end;
$$;

-- 4. Updated sensitive_fields variant (PK is profile_id not id)
create or replace function public.audit_log_sensitive_fields_changes()
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

  if tg_op = 'DELETE' then
    insert into public.audit_log
      (table_name, record_id, operation, actor_id, church_id, actor_role, old_values)
    values
      (tg_table_name, old.profile_id, tg_op, auth.uid(), row_church_id, resolved_role, to_jsonb(old));
    return old;
  elsif tg_op = 'UPDATE' then
    insert into public.audit_log
      (table_name, record_id, operation, actor_id, church_id, actor_role, old_values, new_values)
    values
      (tg_table_name, new.profile_id, tg_op, auth.uid(), row_church_id, resolved_role, to_jsonb(old), to_jsonb(new));
    return new;
  else
    insert into public.audit_log
      (table_name, record_id, operation, actor_id, church_id, actor_role, new_values)
    values
      (tg_table_name, new.profile_id, tg_op, auth.uid(), row_church_id, resolved_role, to_jsonb(new));
    return new;
  end if;
end;
$$;

-- 5. Backfill church_id on existing rows where inferable from JSONB snapshot
update public.audit_log
set church_id = coalesce(
  (new_values ->> 'church_id')::uuid,
  (old_values ->> 'church_id')::uuid
)
where church_id is null
  and coalesce(
    (new_values ->> 'church_id')::uuid,
    (old_values ->> 'church_id')::uuid
  ) is not null;
