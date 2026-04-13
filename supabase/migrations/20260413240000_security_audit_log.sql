-- ============================================================
-- Security: audit_log — write-level audit trail
-- Ref: docs/security-assessment.md (H-5)
-- Ref: docs/security-mitigation-plan.md (P2-B)
--
-- Records all INSERT / UPDATE / DELETE operations on sensitive
-- tables with the actor's auth.uid() and a jsonb snapshot.
-- Only platform_admins can read audit_log directly.
-- Read-level auditing requires pgaudit and is a future item.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Audit log table
-- ------------------------------------------------------------

create table if not exists public.audit_log (
  id           uuid        primary key default gen_random_uuid(),
  table_name   text        not null,
  record_id    uuid        not null,
  operation    text        not null check (operation in ('INSERT', 'UPDATE', 'DELETE', 'ERASE')),
  actor_id     uuid,       -- auth.uid() at time of operation; null if triggered by service role
  changed_at   timestamptz not null default timezone('utc', now()),
  old_values   jsonb,
  new_values   jsonb
);

create index if not exists audit_log_table_record_idx
  on public.audit_log (table_name, record_id);

create index if not exists audit_log_actor_id_idx
  on public.audit_log (actor_id);

create index if not exists audit_log_changed_at_idx
  on public.audit_log (changed_at desc);

alter table public.audit_log enable row level security;

-- Only platform admins can read the audit log
create policy "audit_log_select_platform_admin"
on public.audit_log
for select
to authenticated
using (public.is_platform_admin());

-- No direct INSERT / UPDATE / DELETE from app — only via triggers
-- (no insert/update/delete policies means only SECURITY DEFINER
--  trigger functions can write to this table)

-- ------------------------------------------------------------
-- 2. Generic audit trigger function (tables with id uuid PK)
-- ------------------------------------------------------------

create or replace function public.audit_log_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  record_uuid uuid;
begin
  if tg_op = 'DELETE' then
    record_uuid := (to_jsonb(old) ->> 'id')::uuid;
    insert into public.audit_log (table_name, record_id, operation, actor_id, old_values)
    values (tg_table_name, record_uuid, tg_op, auth.uid(), to_jsonb(old));
    return old;
  elsif tg_op = 'UPDATE' then
    record_uuid := (to_jsonb(new) ->> 'id')::uuid;
    insert into public.audit_log (table_name, record_id, operation, actor_id, old_values, new_values)
    values (tg_table_name, record_uuid, tg_op, auth.uid(), to_jsonb(old), to_jsonb(new));
    return new;
  else
    record_uuid := (to_jsonb(new) ->> 'id')::uuid;
    insert into public.audit_log (table_name, record_id, operation, actor_id, new_values)
    values (tg_table_name, record_uuid, tg_op, auth.uid(), to_jsonb(new));
    return new;
  end if;
end;
$$;

-- ------------------------------------------------------------
-- 3. Audit trigger for profile_sensitive_fields
--    (PK is profile_id, not id)
-- ------------------------------------------------------------

create or replace function public.audit_log_sensitive_fields_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    insert into public.audit_log (table_name, record_id, operation, actor_id, old_values)
    values (tg_table_name, old.profile_id, tg_op, auth.uid(), to_jsonb(old));
    return old;
  elsif tg_op = 'UPDATE' then
    insert into public.audit_log (table_name, record_id, operation, actor_id, old_values, new_values)
    values (tg_table_name, new.profile_id, tg_op, auth.uid(), to_jsonb(old), to_jsonb(new));
    return new;
  else
    insert into public.audit_log (table_name, record_id, operation, actor_id, new_values)
    values (tg_table_name, new.profile_id, tg_op, auth.uid(), to_jsonb(new));
    return new;
  end if;
end;
$$;

-- ------------------------------------------------------------
-- 4. Attach triggers to sensitive tables
-- ------------------------------------------------------------

-- profiles
drop trigger if exists audit_profiles_changes on public.profiles;
create trigger audit_profiles_changes
  after insert or update or delete on public.profiles
  for each row execute function public.audit_log_changes();

-- profile_sensitive_fields
drop trigger if exists audit_profile_sensitive_fields_changes on public.profile_sensitive_fields;
create trigger audit_profile_sensitive_fields_changes
  after insert or update or delete on public.profile_sensitive_fields
  for each row execute function public.audit_log_sensitive_fields_changes();

-- pastoral_notes
drop trigger if exists audit_pastoral_notes_changes on public.pastoral_notes;
create trigger audit_pastoral_notes_changes
  after insert or update or delete on public.pastoral_notes
  for each row execute function public.audit_log_changes();

-- care_assignments
drop trigger if exists audit_care_assignments_changes on public.care_assignments;
create trigger audit_care_assignments_changes
  after insert or update or delete on public.care_assignments
  for each row execute function public.audit_log_changes();

-- consent_logs
drop trigger if exists audit_consent_logs_changes on public.consent_logs;
create trigger audit_consent_logs_changes
  after insert or update or delete on public.consent_logs
  for each row execute function public.audit_log_changes();
