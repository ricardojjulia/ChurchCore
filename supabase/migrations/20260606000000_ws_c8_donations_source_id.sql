-- WS-C8: Giving/donations CSV import — source_id dedup column and index.
-- Adds source_id for idempotent re-imports. The donations table already exists
-- from earlier Sprint 4 migrations.

ALTER TABLE public.donations ADD COLUMN IF NOT EXISTS source_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS donations_source_id_church_idx
  ON public.donations (church_id, source_id)
  WHERE source_id IS NOT NULL;
