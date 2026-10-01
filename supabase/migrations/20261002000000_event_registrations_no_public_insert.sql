-- S10 (Council Review 22): no direct inserts into event_registrations from
-- the public API.
--
-- event_registrations_public_insert (`with check (true)`, every role) let
-- anyone holding the public anon key insert any registration for any church:
-- confirmed, marked paid, past capacity and the deadline, for a staff-only
-- event. The "church_id must be verified by the action" note on it was never
-- enforceable, since the API is reachable without the action.
--
-- Visitors now register through submitPublicEventRegistrationAction, which
-- checks the event is public and open, the deadline, capacity and the
-- waitlist, and writes with the church-scoped admin client (ADR 0022), as
-- the member action already does (S8). Staff keep event_registrations_manage.

drop policy if exists "event_registrations_public_insert" on public.event_registrations;
