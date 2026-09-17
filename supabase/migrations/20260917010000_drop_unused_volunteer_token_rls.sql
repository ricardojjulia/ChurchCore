-- Fix: volunteer_shifts_token_select / volunteer_shifts_token_update granted
-- anon/authenticated SELECT and UPDATE on ANY row with a non-null, unexpired
-- confirmation_token -- not scoped to a token the requester actually
-- presented. Since the public anon key is inherently client-visible, any
-- caller could enumerate or modify every outstanding tokenized volunteer
-- shift across every church by querying/updating volunteer_shifts directly
-- against Supabase's REST API, bypassing the app entirely.
--
-- These policies were never actually needed: every server action that
-- serves the public confirm/decline/schedule routes
-- (getPublicVolunteerShiftByToken, getPublicVolunteerScheduleByToken,
-- respondToPublicShiftAction in app/app/volunteer-actions.ts) already
-- validates the token application-side and reads/writes through
-- createTenantAdminClient() (service role, bypasses RLS). The anon/
-- authenticated grants were pure unused attack surface.
--
-- Flagged by automated PR review on PR #135 (Council Review 9 backlog).

DROP POLICY IF EXISTS volunteer_shifts_token_select ON public.volunteer_shifts;
DROP POLICY IF EXISTS volunteer_shifts_token_update ON public.volunteer_shifts;
