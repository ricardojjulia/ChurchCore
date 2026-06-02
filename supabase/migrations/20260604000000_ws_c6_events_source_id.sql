ALTER TABLE public.events ADD COLUMN IF NOT EXISTS source_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS events_source_id_church_idx
  ON public.events (church_id, source_id)
  WHERE source_id IS NOT NULL;
