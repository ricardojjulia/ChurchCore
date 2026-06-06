-- RLS helper functions must be SECURITY DEFINER so they bypass RLS when
-- querying church_memberships and platform_admins internally.
-- Without SECURITY DEFINER, belongs_to_church() queries church_memberships,
-- which triggers the memberships_select_member_scope RLS policy, which calls
-- belongs_to_church() again → infinite recursion → stack depth exceeded.

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_admins platform_admin
    where platform_admin.user_id = auth.uid()
  );
$$;

create or replace function public.belongs_to_church(target_church uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_platform_admin()
    or exists (
      select 1
      from public.church_memberships membership
      where membership.church_id = target_church
        and membership.user_id = auth.uid()
        and membership.is_active
    );
$$;

create or replace function public.can_manage_church(target_church uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_platform_admin()
    or exists (
      select 1
      from public.church_memberships membership
      where membership.church_id = target_church
        and membership.user_id = auth.uid()
        and membership.is_active
        and membership.role in ('church_admin', 'pastor', 'ministry_leader')
    );
$$;
