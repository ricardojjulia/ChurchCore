-- Migration: Add Sandbox Mode indicator to Churches
-- Add is_sandbox column to public.churches

ALTER TABLE public.churches
  ADD COLUMN IF NOT EXISTS is_sandbox boolean NOT NULL DEFAULT false;
