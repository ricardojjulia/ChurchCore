-- Fix audit_mentorship_pairs trigger: references changed_by but column is actor_id.

create or replace function public.audit_mentorship_pairs()
returns trigger language plpgsql security definer as $$
begin
  insert into public.audit_log (table_name, record_id, operation, actor_id, changed_at)
  values (
    'mentorship_pairs',
    coalesce(new.id, old.id),
    tg_op,
    auth.uid(),
    timezone('utc', now())
  );
  return coalesce(new, old);
end;
$$;
