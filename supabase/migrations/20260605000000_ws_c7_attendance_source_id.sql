-- WS-C7: Attendance CSV import — source_id dedup column and index.
-- Note: The attendance_check_in_method_check constraint already includes 'import'
-- (added in 20260527100000_member_mobile_checkin_foundation.sql).
-- This migration only adds the source_id column and its partial unique index.

ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS source_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS attendance_source_id_church_idx
  ON public.attendance (church_id, source_id)
  WHERE source_id IS NOT NULL;
