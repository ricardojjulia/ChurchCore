-- Fix platform_admins FK: user_id should reference auth.users(id), not profiles(id).
-- The is_platform_admin() RLS function matches user_id against auth.uid() (an auth user UUID),
-- so the FK must point to auth.users.

alter table public.platform_admins
  drop constraint if exists platform_admins_user_id_fkey;

alter table public.platform_admins
  add constraint platform_admins_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete cascade;
