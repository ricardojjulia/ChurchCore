-- S1 (Council Review 17 F7, Review 18): communication_logs access matches the
-- communications pages.
--
-- The pages (/app/communications/*) admit church admins, pastors and
-- secretaries; the log policies used can_manage_church (church admin, pastor,
-- ministry leader). So a secretary's history pages showed nothing ("not
-- found"), while a ministry leader — whom the app denies — could read every
-- log through the API. Reads now use can_manage_communications, the helper
-- the templates and dead-letter queue already use. Members still read the
-- messages sent to them.
--
-- Writes: every writer of these three tables is server-side and uses the
-- church-scoped admin client (ADR 0022), so authenticated gets no insert
-- policy at all. Mapping insert to the readers' roles would let a secretary
-- fabricate logs, delivery events (provider statuses, recipient contacts) or
-- suppressions through PostgREST (Council Review 28, PR #165 review).

drop policy if exists "communication_logs_select_management" on public.communication_logs;
create policy "communication_logs_select_management" on public.communication_logs
  for select to authenticated
  using (public.can_manage_communications(church_id));

drop policy if exists "communication_logs_insert_management" on public.communication_logs;

-- Council Review 28: the same mismatch one table over. A message's delivery
-- events (its detail page and analytics) and the suppression list are part
-- of the same communications pages, but still used can_manage_church: a
-- secretary's message analytics showed all zeros, and a ministry leader could
-- read recipients' contact details and suppress any member's email or phone
-- through the API. Reads move to can_manage_communications; the insert
-- policies are dropped (see above). Unsubscribe, send-time suppression checks
-- and the manual suppress action use the admin client.

drop policy if exists "communication_delivery_events_select_management" on public.communication_delivery_events;
create policy "communication_delivery_events_select_management" on public.communication_delivery_events
  for select to authenticated
  using (public.can_manage_communications(church_id));

drop policy if exists "communication_delivery_events_insert_management" on public.communication_delivery_events;

drop policy if exists "communication_suppressions_select_management" on public.communication_suppressions;
create policy "communication_suppressions_select_management" on public.communication_suppressions
  for select to authenticated
  using (public.can_manage_communications(church_id));

drop policy if exists "communication_suppressions_insert_management" on public.communication_suppressions;
