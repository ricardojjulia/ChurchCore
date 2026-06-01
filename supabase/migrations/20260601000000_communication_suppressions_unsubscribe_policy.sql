-- Allow the service role (used by the unsubscribe API route) to insert suppressions
-- from unauthenticated unsubscribe link flows.
create policy "communication_suppressions_service_role_insert"
on public.communication_suppressions
for insert
to service_role
with check (true);

create policy "communication_suppressions_service_role_upsert"
on public.communication_suppressions
for update
to service_role
using (true)
with check (true);
