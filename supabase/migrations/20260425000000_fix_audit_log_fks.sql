-- Fix tenant_view_audit_logs FK: actor_user_id should reference auth.users(id).
-- The RLS insert policy checks actor_user_id = auth.uid() (an auth user UUID),
-- and the app passes session.userId (also an auth user UUID).
-- The original FK to profiles(id) is inconsistent and causes FK violations on insert.

alter table public.tenant_view_audit_logs
  drop constraint if exists tenant_view_audit_logs_actor_user_id_fkey;

alter table public.tenant_view_audit_logs
  add constraint tenant_view_audit_logs_actor_user_id_fkey
  foreign key (actor_user_id) references auth.users (id) on delete cascade;
