-- Migration: Volunteer Sessional Confirmation Tokens
-- Add confirmation_token and confirmation_token_expires_at to public.volunteer_shifts
-- Add RLS policies for anonymous confirm/decline token actions.

ALTER TABLE public.volunteer_shifts
  ADD COLUMN IF NOT EXISTS confirmation_token text UNIQUE,
  ADD COLUMN IF NOT EXISTS confirmation_token_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS volunteer_shifts_confirmation_token_idx
  ON public.volunteer_shifts (confirmation_token)
  WHERE confirmation_token IS NOT NULL;

-- Enable public select/update on matching tokens within the validity window
DROP POLICY IF EXISTS volunteer_shifts_token_select ON public.volunteer_shifts;
DROP POLICY IF EXISTS volunteer_shifts_token_update ON public.volunteer_shifts;

CREATE POLICY volunteer_shifts_token_select
  ON public.volunteer_shifts
  FOR SELECT
  TO anon, authenticated
  USING (
    confirmation_token IS NOT NULL
    AND confirmation_token_expires_at > timezone('utc', now())
  );

CREATE POLICY volunteer_shifts_token_update
  ON public.volunteer_shifts
  FOR UPDATE
  TO anon, authenticated
  USING (
    confirmation_token IS NOT NULL
    AND confirmation_token_expires_at > timezone('utc', now())
  )
  WITH CHECK (
    confirmation_token IS NOT NULL
    AND confirmation_token_expires_at > timezone('utc', now())
  );
