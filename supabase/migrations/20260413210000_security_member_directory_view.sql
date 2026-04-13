-- ============================================================
-- Security: member_directory view + tighten profiles RLS
-- Ref: docs/security-assessment.md (C-3, M-4)
-- Ref: docs/security-mitigation-plan.md (P1-B)
--
-- Problem: profiles_select_member_scope exposes ALL columns
-- of ALL profiles to any authenticated church member.
-- Fix:
--   1. Tighten RLS to restrict non-admin members to
--      directory_visible = true rows only.
--   2. Create member_directory view that projects only safe
--      columns for member-facing directory queries.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Replace the overly broad member SELECT policy
-- ------------------------------------------------------------

drop policy if exists "profiles_select_member_scope" on public.profiles;

create policy "profiles_select_member_scope"
on public.profiles
for select
to authenticated
using (
  church_id is not null
  and public.belongs_to_church(church_id)
  and (
    -- Own profile is always fully readable
    user_id = auth.uid()
    -- Church admins, pastors, and ministry leaders see all profiles
    or public.can_manage_church(church_id)
    -- Regular members only see directory-visible, non-merged profiles
    or (directory_visible = true and merged_at is null)
  )
);

-- ------------------------------------------------------------
-- 2. Create the member_directory view
--
-- This is the canonical surface for member-facing directory
-- queries. It exposes only safe columns and applies
-- contact_allowed masking inline. Sensitive fields
-- (date_of_birth, emergency contacts, last_attendance,
-- preferred_contact_method, spiritual_gifts, interests,
-- avatar_url, is_pastoral, user_id) are excluded entirely.
--
-- The view is SECURITY INVOKER (default in PG 15+), so the
-- caller's RLS policies on the underlying profiles table are
-- still evaluated — the view adds column restriction on top.
-- ------------------------------------------------------------

create or replace view public.member_directory
with (security_invoker = true)
as
select
  p.id,
  p.church_id,
  p.full_name,
  p.display_title,
  p.membership_status,
  p.family_id,
  p.directory_visible,
  p.contact_allowed,
  case when p.contact_allowed then p.email else null end  as email,
  case when p.contact_allowed then p.phone else null end  as phone,
  p.merged_at
from public.profiles p
where p.directory_visible = true
  and p.merged_at is null;

-- Grant SELECT to authenticated. RLS on profiles still filters rows.
grant select on public.member_directory to authenticated;

-- ------------------------------------------------------------
-- 3. Tighten families SELECT to match directory intent
--
-- Families are currently readable by any church member.
-- This is acceptable for family name + address lookup when
-- directory_visible = true and the member shares the family.
-- We leave the existing policy but document the intent.
-- Future: restrict to families where at least one member is
-- directory_visible, or restrict address/phone to same-family.
-- ------------------------------------------------------------

-- (Existing families_select_member_scope is correct in scope
--  for now; family address restriction is Phase 3.)
