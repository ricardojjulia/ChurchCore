-- Sprint 2: audit church role and membership changes.

drop trigger if exists audit_church_memberships_changes on public.church_memberships;
create trigger audit_church_memberships_changes
  after insert or update or delete on public.church_memberships
  for each row execute function public.audit_log_changes();
