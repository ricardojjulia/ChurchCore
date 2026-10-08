-- G4.1 / Council Review 45 (R1, R2): import staging belongs to church admins.
--
-- 20260529011500 let anyone passing can_manage_church (church admin, pastor,
-- ministry leader) read, insert and update import batches and their rows. The
-- import pages are church-admin only, but a pastor could plant a staged row
-- carrying any profile, event, ministry or leader id into an admin's pending
-- batch, and the admin's commit would then write it. Staging is now limited to
-- active church-admin memberships (and platform admins, as can_manage_church
-- always allowed). RLS stays enabled; anon has no access; there is still no
-- delete policy.
--
-- Also widens import_batches.status with 'committing': a commit first claims
-- the batch (dry_run_completed -> committing) so two concurrent commits cannot
-- both run.
--
-- Rollback:
--   drop the six *_church_admin policies below; recreate the original
--   *_management policies using public.can_manage_church(church_id);
--   alter table public.import_batches drop constraint import_batches_status_check,
--     add constraint import_batches_status_check
--       check (status in ('draft','dry_run_completed','committed','failed'));
--   (fails while any row is 'committing').

drop policy if exists "import_batches_select_management" on public.import_batches;
drop policy if exists "import_batches_insert_management" on public.import_batches;
drop policy if exists "import_batches_update_management" on public.import_batches;
drop policy if exists "import_batch_rows_select_management" on public.import_batch_rows;
drop policy if exists "import_batch_rows_insert_management" on public.import_batch_rows;

create policy "import_batches_select_church_admin" on public.import_batches
  for select to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1 from public.church_memberships membership
      where membership.church_id = import_batches.church_id
        and membership.user_id = auth.uid()
        and membership.role = 'church_admin'
        and membership.is_active
    )
  );

create policy "import_batches_insert_church_admin" on public.import_batches
  for insert to authenticated
  with check (
    public.is_platform_admin()
    or exists (
      select 1 from public.church_memberships membership
      where membership.church_id = import_batches.church_id
        and membership.user_id = auth.uid()
        and membership.role = 'church_admin'
        and membership.is_active
    )
  );

create policy "import_batches_update_church_admin" on public.import_batches
  for update to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1 from public.church_memberships membership
      where membership.church_id = import_batches.church_id
        and membership.user_id = auth.uid()
        and membership.role = 'church_admin'
        and membership.is_active
    )
  )
  with check (
    public.is_platform_admin()
    or exists (
      select 1 from public.church_memberships membership
      where membership.church_id = import_batches.church_id
        and membership.user_id = auth.uid()
        and membership.role = 'church_admin'
        and membership.is_active
    )
  );

create policy "import_batch_rows_select_church_admin" on public.import_batch_rows
  for select to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1 from public.church_memberships membership
      where membership.church_id = import_batch_rows.church_id
        and membership.user_id = auth.uid()
        and membership.role = 'church_admin'
        and membership.is_active
    )
  );

create policy "import_batch_rows_insert_church_admin" on public.import_batch_rows
  for insert to authenticated
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

revoke all on public.import_batches from anon;
revoke all on public.import_batch_rows from anon;

alter table public.import_batches drop constraint import_batches_status_check;
alter table public.import_batches
  add constraint import_batches_status_check
  check (status in ('draft', 'dry_run_completed', 'committing', 'committed', 'failed'));
