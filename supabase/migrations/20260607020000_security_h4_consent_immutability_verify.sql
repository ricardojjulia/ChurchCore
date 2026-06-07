-- Security H-4: consent_logs — re-assert insert-only contract (idempotent)
-- Drops any UPDATE policy that may exist, re-applies backdating + non-empty constraints.

do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename  = 'consent_logs'
      and cmd        = 'UPDATE'
  loop
    execute format('drop policy if exists %I on public.consent_logs', pol.policyname);
  end loop;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'consent_logs_consented_at_not_backdated'
  ) then
    alter table public.consent_logs
      add constraint consent_logs_consented_at_not_backdated
      check (consented_at >= (now() - interval '10 minutes'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'consent_logs_consent_type_nonempty'
  ) then
    alter table public.consent_logs
      add constraint consent_logs_consent_type_nonempty
      check (length(trim(consent_type)) > 0);
  end if;
end $$;
