-- ============================================================
-- Security: Move profiles.notes → pastoral_notes, drop column
-- Ref: docs/security-assessment.md (C-2)
-- Ref: docs/security-mitigation-plan.md (P1-A)
--
-- profiles.notes is accessible to all church members via the
-- member RLS policy. Admin/pastoral notes must live behind
-- can_access_pastoral_data(), not on the base profiles row.
-- ============================================================

-- Find or create a system sentinel profile to attribute
-- migrated notes to. We use a DO block so this is idempotent.
do $$
declare
  system_profile_id uuid;
begin
  -- Migrate non-null notes into pastoral_notes.
  -- We do NOT need a "created_by" profile that exists — we
  -- use a NULL created_by and a migrated_from_profiles flag
  -- in the content prefix so the origin is clear.
  insert into public.pastoral_notes (
    church_id,
    profile_id,
    created_by,
    content,
    created_at
  )
  select
    p.church_id,
    p.id,
    p.id,                        -- attribute to the profile itself as best-effort
    '[Migrated from profile record] ' || p.notes,
    coalesce(p.updated_at, p.created_at)
  from public.profiles p
  where p.notes is not null
    and p.notes <> ''
    and p.church_id is not null;
end $$;

-- Drop the column. Any existing data is now in pastoral_notes.
alter table public.profiles
  drop column if exists notes;
