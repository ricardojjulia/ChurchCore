-- G4.2: per-row commit outcomes for the import reconciliation report.
--
-- Each staged row records what the commit did with it: written (with the id of
-- the record it created or updated) or failed (with a safe reason). A row the
-- commit never reached keeps a null outcome ("not attempted"). commit_snapshot
-- holds the key values at commit (giving: source vs stored amount, date, fund)
-- so the report can tell an import mistake from a later edit without reading
-- the staged payload (which carries personal data).
--
-- Church admins gain an UPDATE policy on import_batch_rows, limited by column
-- grants to the four outcome columns: the staged payload and its
-- classification stay immutable. Bulk recording goes through a SECURITY
-- INVOKER function, so RLS and the column grants apply to the caller.
--
-- A BEFORE INSERT OR UPDATE trigger (every role, no bypass) keeps the outcomes
-- honest: they can be set only while the parent batch is 'committing', and an
-- outcome that is already set can never change. A church admin therefore cannot
-- rewrite a report after the commit.
--
-- Rollback:
--   drop trigger if exists import_batch_rows_commit_outcome_guard on public.import_batch_rows;
--   drop function if exists public.guard_import_row_commit_outcome();
--   drop function if exists public.record_import_row_outcomes(uuid, jsonb);
--   drop policy if exists "import_batch_rows_update_church_admin" on public.import_batch_rows;
--   grant update on public.import_batch_rows to authenticated;
--   alter table public.import_batch_rows
--     drop column commit_outcome, drop column committed_record_id,
--     drop column commit_failure_reason, drop column commit_snapshot;

alter table public.import_batch_rows
  add column commit_outcome text check (commit_outcome in ('written', 'failed')),
  add column committed_record_id uuid,
  add column commit_failure_reason text,
  add column commit_snapshot jsonb;

create policy "import_batch_rows_update_church_admin" on public.import_batch_rows
  for update to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1 from public.church_memberships membership
      where membership.church_id = import_batch_rows.church_id
        and membership.user_id = auth.uid()
        and membership.role = 'church_admin'
        and membership.is_active
    )
  )
  with check (
    public.is_platform_admin()
    or exists (
      select 1 from public.church_memberships membership
      where membership.church_id = import_batch_rows.church_id
        and membership.user_id = auth.uid()
        and membership.role = 'church_admin'
        and membership.is_active
    )
  );

revoke update on public.import_batch_rows from authenticated;
grant update (commit_outcome, committed_record_id, commit_failure_reason, commit_snapshot)
  on public.import_batch_rows to authenticated;

create or replace function public.record_import_row_outcomes(p_batch_id uuid, p_outcomes jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.import_batch_rows as r
  set commit_outcome = o.commit_outcome,
      committed_record_id = o.committed_record_id,
      commit_failure_reason = o.commit_failure_reason,
      commit_snapshot = o.commit_snapshot
  from jsonb_to_recordset(p_outcomes) as o(
    id uuid,
    commit_outcome text,
    committed_record_id uuid,
    commit_failure_reason text,
    commit_snapshot jsonb
  )
  where r.batch_id = p_batch_id
    and r.id = o.id
    and r.commit_outcome is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.record_import_row_outcomes(uuid, jsonb) from public, anon;
grant execute on function public.record_import_row_outcomes(uuid, jsonb) to authenticated;

create or replace function public.guard_import_row_commit_outcome()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status text;
  v_touches boolean;
begin
  if tg_op = 'INSERT' then
    v_touches := new.commit_outcome is not null
      or new.committed_record_id is not null
      or new.commit_failure_reason is not null
      or new.commit_snapshot is not null;
  else
    v_touches := new.commit_outcome is distinct from old.commit_outcome
      or new.committed_record_id is distinct from old.committed_record_id
      or new.commit_failure_reason is distinct from old.commit_failure_reason
      or new.commit_snapshot is distinct from old.commit_snapshot;
    if v_touches and old.commit_outcome is not null then
      raise exception 'A recorded import row outcome cannot be changed.' using errcode = '42501';
    end if;
  end if;

  if v_touches then
    select status into v_status from public.import_batches where id = new.batch_id;
    if v_status is distinct from 'committing' then
      raise exception 'Import row outcomes can only be recorded while the batch is committing.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger import_batch_rows_commit_outcome_guard
  before insert or update on public.import_batch_rows
  for each row execute function public.guard_import_row_commit_outcome();
