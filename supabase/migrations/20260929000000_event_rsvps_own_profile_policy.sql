-- S8 (member writes vs. RLS): fix the event_rsvps self policy.
--
-- event_rsvps.user_id references public.profiles(id), but the self policy
-- compared it with auth.uid() (the login id). A profile id never equals a
-- login id (profiles get gen_random_uuid() since 20260420000000), so every
-- member RSVP was rejected. Members now manage only their own RSVP — matched
-- through profiles.user_id = auth.uid() — and only for an RSVP-enabled event
-- in their own church. Managers keep full access through can_manage_church.

drop policy if exists "rsvps_manage_self_or_management_scope" on public.event_rsvps;

create policy "rsvps_manage_self_or_management_scope"
  on public.event_rsvps for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = event_rsvps.user_id and p.user_id = auth.uid()
    )
    or exists (
      select 1 from public.events event
      where event.id = event_rsvps.event_id and public.can_manage_church(event.church_id)
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      join public.events event on event.id = event_rsvps.event_id
      where p.id = event_rsvps.user_id
        and p.user_id = auth.uid()
        and event.church_id = p.church_id
        and event.rsvp_enabled
    )
    or exists (
      select 1 from public.events event
      where event.id = event_rsvps.event_id and public.can_manage_church(event.church_id)
    )
  );
