-- Fix audit trigger functions that still write to audit_log.changed_by.
-- audit_log has used actor_id since 20260413240000_security_audit_log.sql.

create or replace function public.audit_children_sensitive_access()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.audit_log (table_name, record_id, operation, actor_id, changed_at)
  values (
    'children_sensitive_data',
    coalesce(new.id, old.id),
    tg_op,
    auth.uid(),
    timezone('utc', now())
  );
  return coalesce(new, old);
end;
$$;

create or replace function public.audit_ccm_access()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.audit_log (table_name, record_id, operation, actor_id, changed_at)
  values (
    tg_table_name,
    coalesce(new.id, old.id),
    tg_op,
    auth.uid(),
    timezone('utc', now())
  );
  return coalesce(new, old);
end;
$$;
