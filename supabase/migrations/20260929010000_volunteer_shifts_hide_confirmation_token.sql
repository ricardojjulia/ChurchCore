-- Council Review 23 (G1.5): hide volunteer confirm tokens from members.
--
-- volunteer_shifts_select_member_scope lets every member of a church read its
-- shifts, and the table-wide SELECT grant included confirmation_token — the
-- secret in each volunteer's /portal/volunteer/confirm/<token> and
-- /portal/volunteer/schedule/<token> links. Any member could read another
-- volunteer's token through PostgREST, then decline their shift or read their
-- schedule. G1.5 gives every assignment a token, so this is closed now.
--
-- Members keep reading every other column. The app reads and writes the
-- token only on the server, through the church-scoped admin client
-- (ADR 0022). anon has no SELECT policy on this table, so it loses nothing.
--
-- NOTE: with a column-level grant, a column added to volunteer_shifts later is
-- NOT readable by authenticated until it's added to the grant below.

revoke select on public.volunteer_shifts from anon, authenticated;

grant select (
  id,
  church_id,
  event_id,
  ministry_id,
  assigned_user_id,
  title,
  starts_at,
  ends_at,
  status,
  created_at,
  updated_at,
  plan_id,
  position_id,
  confirmation_status,
  decline_reason,
  responded_at,
  volunteer_notes,
  confirmation_token_expires_at
) on public.volunteer_shifts to authenticated;
