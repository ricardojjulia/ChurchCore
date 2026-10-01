-- Council Review 33 (S10): two more public-API reach-arounds next to public
-- event registration.
--
-- 1. event_registration_payments_read_member (`belongs_to_church`) let any
--    member read every registration payment in their church: amounts,
--    statuses, payment intent ids. No member screen reads payments; staff
--    keep event_registration_payments_manage. A member now sees only the
--    payments for their own registrations.
--
-- 2. account_requests_insert_public let anyone with the anon key insert a
--    pending account request for any church, skipping
--    submit_account_request's checks (church exists, names and email
--    present, no active account already). The portal only ever calls that
--    function, which is SECURITY DEFINER and stays the only way in.

drop policy if exists "event_registration_payments_read_member" on public.event_registration_payments;
create policy "event_registration_payments_read_own" on public.event_registration_payments
  for select to authenticated
  using (
    exists (
      select 1
      from public.event_registrations registration
      where registration.id = event_registration_payments.registration_id
        and registration.profile_id = (select id from public.profiles where user_id = auth.uid() limit 1)
    )
  );

drop policy if exists "account_requests_insert_public" on public.account_requests;
