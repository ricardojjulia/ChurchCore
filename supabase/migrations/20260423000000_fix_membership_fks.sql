-- Fix church_memberships FK: user_id should reference auth.users(id), not profiles(id).
-- The auth layer queries church_memberships.user_id = auth.uid() (Supabase auth user UUID).
-- The original FK to profiles(id) is inconsistent with this usage.

alter table public.church_memberships
  drop constraint if exists church_memberships_user_id_fkey;

alter table public.church_memberships
  add constraint church_memberships_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete cascade;
