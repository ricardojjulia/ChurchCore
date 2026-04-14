-- ============================================================
-- Ministry Core — Phase 1
-- Ref: advanced_ministry_elder_pastor.md §2 (Ministry extensions)
-- Ref: churchgoer_data.md (profile_ministries)
--
-- Extends the ministries table with type, vision, and scriptural
-- anchor fields. Extends the existing profile_ministries table
-- (created in sprint1_member_portal_alignment) with church_id,
-- role, joined_at, and a standalone UUID pk.
-- ============================================================

-- Ministry type + vision/scripture columns
alter table public.ministries
  add column if not exists ministry_type text
    check (
      ministry_type is null or ministry_type in (
        'outreach',
        'discipleship',
        'worship',
        'care',
        'administration',
        'youth',
        'children',
        'missions'
      )
    ),
  add column if not exists vision_statement text,
  add column if not exists scriptural_anchor text[];

-- --------------------------------------------------------
-- Extend profile_ministries
-- The table exists with only (profile_id, ministry_id, created_at).
-- Add church_id for church-scoped RLS, role for leadership tier,
-- joined_at as a semantic alias for the join date.
-- --------------------------------------------------------

alter table public.profile_ministries
  add column if not exists church_id uuid references public.churches(id) on delete cascade,
  add column if not exists role     text not null default 'member'
    check (role in ('member', 'leader', 'assistant_leader')),
  add column if not exists joined_at timestamptz not null default timezone('utc', now());

-- Back-fill church_id from the related ministry for any existing rows
update public.profile_ministries pm
set church_id = m.church_id
from public.ministries m
where m.id = pm.ministry_id
  and pm.church_id is null;

-- Make church_id NOT NULL now that existing rows are filled
-- (Use a DO block to be idempotent — constraint may already be set)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'profile_ministries'
      and column_name  = 'church_id'
      and is_nullable  = 'YES'
  ) then
    alter table public.profile_ministries
      alter column church_id set not null;
  end if;
end $$;

-- Indexes
create index if not exists profile_ministries_church_id_idx
  on public.profile_ministries (church_id);

create index if not exists profile_ministries_profile_id_idx
  on public.profile_ministries (profile_id);

create index if not exists profile_ministries_ministry_id_idx
  on public.profile_ministries (ministry_id);

-- --------------------------------------------------------
-- RLS — drop old policies and replace with composable helpers
-- --------------------------------------------------------

-- Drop policies created in the sprint1 migration if they still exist
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'profile_ministries'
      and policyname = 'profile_ministries_select_member_scope'
  ) then
    drop policy "profile_ministries_select_member_scope" on public.profile_ministries;
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'profile_ministries'
      and policyname = 'profile_ministries_manage_management_scope'
  ) then
    drop policy "profile_ministries_manage_management_scope" on public.profile_ministries;
  end if;
end $$;

-- Members can see their own assignments; management can see all in church
create policy "profile_ministries_select_own_or_management_scope"
  on public.profile_ministries for select
  to authenticated
  using (
    profile_id = (
      select id from public.profiles
      where user_id = auth.uid()
      limit 1
    )
    or public.can_manage_church(church_id)
  );

-- Only management can assign/remove ministry members
create policy "profile_ministries_manage_management_scope"
  on public.profile_ministries for all
  to authenticated
  using (public.can_manage_church(church_id))
  with check (public.can_manage_church(church_id));
