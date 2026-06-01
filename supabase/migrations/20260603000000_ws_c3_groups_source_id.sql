ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS source_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS groups_source_id_church_idx
  ON public.groups (church_id, source_id)
  WHERE source_id IS NOT NULL;
