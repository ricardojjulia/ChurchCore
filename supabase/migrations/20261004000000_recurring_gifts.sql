-- G3.1 + G3.2: recurring gifts and their installments.
--
-- A recurring gift is a member's standing plan (amount, fund, frequency,
-- start date), backed by a Stripe subscription on the church's own
-- connected account (ADR 0025). Each charge Stripe makes for it (an
-- invoice) becomes one row in public.donations, keyed by the invoice id so
-- a retried webhook can't record it twice. Only the server writes these
-- rows (church-scoped admin client, ADR 0022); members read their own and
-- church managers read their church's.

create table public.recurring_gifts (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches (id) on delete cascade,
  profile_id uuid references public.profiles (id) on delete set null,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'usd',
  fund_designation text,
  frequency text not null check (frequency in ('weekly', 'biweekly', 'monthly')),
  start_date date not null,
  -- incomplete: card not yet confirmed; past_due: Stripe couldn't charge
  -- the last installment and is retrying.
  status text not null default 'incomplete'
    check (status in ('incomplete', 'active', 'paused', 'past_due', 'cancelled')),
  is_anonymous boolean not null default false,
  stripe_subscription_id text unique,
  stripe_customer_id text,
  stripe_account_id text,
  next_payment_at timestamptz,
  last_payment_at timestamptz,
  cancelled_at timestamptz,
  -- When Stripe created the newest subscription event applied here: Stripe
  -- doesn't deliver events in order, so an older one is ignored.
  stripe_event_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.recurring_gifts is
  'A member''s recurring gift: a Stripe subscription on the church''s connected account (G3.1, ADR 0025). Installments are rows in donations. Written only by the server.';

create index recurring_gifts_church_idx on public.recurring_gifts (church_id, status);
create index recurring_gifts_profile_idx on public.recurring_gifts (profile_id);

alter table public.recurring_gifts enable row level security;

create policy "recurring_gifts_select_own" on public.recurring_gifts
  for select to authenticated
  using (
    profile_id in (select id from public.profiles where user_id = auth.uid())
  );

-- Managers read their church's gifts, but not anonymous ones: those rows
-- carry the giver's profile_id (so the giver can manage the gift), which a
-- direct query could resolve to a name. The admin panel reads every gift
-- through the server, with anonymous givers masked (PR #177 review).
create policy "recurring_gifts_select_management" on public.recurring_gifts
  for select to authenticated
  using (public.can_manage_church(church_id) and not is_anonymous);

revoke all on public.recurring_gifts from anon;

-- Installments and the retry-safe completion of every gift (G3.2).
alter table public.donations
  add column recurring_gift_id uuid references public.recurring_gifts (id) on delete set null,
  -- One donation per Stripe invoice: a retried invoice.paid finds it.
  add column stripe_invoice_id text unique,
  -- Written last, once the gift is posted to the ledger and its receipt is
  -- accepted by the email provider: a webhook retry resumes any gift
  -- without it.
  add column completed_at timestamptz,
  -- A worker is sending the receipt. A lease, not proof of delivery
  -- (receipt_sent_at is that): a claim older than a few minutes is from a
  -- worker that stopped, and the next attempt takes it over.
  add column receipt_claimed_at timestamptz,
  -- The same pair for the "installment failed" notice: claimed while
  -- sending, sent once the provider accepted it (once per invoice).
  add column failure_notice_claimed_at timestamptz,
  add column failure_notice_sent_at timestamptz;

create index donations_recurring_gift_idx on public.donations (recurring_gift_id);

-- Gifts that succeeded before this migration, with evidence their work was
-- done: the receipt went out (or there was no one to send it to), and the
-- gift is in the ledger (or its fund has no ledger mapping). The rest are
-- left incomplete, so a replayed event repairs them rather than skipping
-- them (PR #177 review); none of them is re-receipted, since a sent receipt
-- is recorded in receipt_sent_at.
update public.donations d
set completed_at = d.updated_at
where d.status = 'succeeded'
  and d.completed_at is null
  and (d.receipt_sent_at is not null or d.donor_email is null)
  and (
    exists (select 1 from public.donation_gl_posts p where p.donation_id = d.id)
    or not exists (
      select 1 from public.giving_fund_accounts m
      where m.church_id = d.church_id
        and m.fund_designation = coalesce(d.fund_designation, 'General')
        and m.is_active
    )
  );

-- Posting a gift to the ledger, in one transaction, one caller at a time per
-- gift (G3.2, PR #177 review): the check, the journal, its lines and the
-- link commit together or not at all, so concurrent completions can't post
-- twice and a failure can't leave half a journal. Called only by the server
-- (service role); never by a client.
create or replace function public.post_donation_to_gl(p_donation_id uuid, p_church_id uuid)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  gift record;
  mapping record;
  new_journal_id uuid;
  memo text;
begin
  perform pg_advisory_xact_lock(hashtextextended('post_donation_to_gl:' || p_donation_id::text, 0));

  -- This church's gift first: nothing about another church's gift, not
  -- even whether it's posted, is answered.
  select id, amount_cents, fund_designation into gift
  from public.donations
  where id = p_donation_id and church_id = p_church_id;
  if not found then
    return 'missing';
  end if;

  if exists (select 1 from public.donation_gl_posts where donation_id = p_donation_id) then
    return 'already_posted';
  end if;

  select asset_account_id, income_account_id into mapping
  from public.giving_fund_accounts
  where church_id = p_church_id
    and fund_designation = coalesce(gift.fund_designation, 'General')
    and is_active
  limit 1;
  if not found then
    return 'unmapped';
  end if;

  insert into public.finance_journals (church_id, journal_date, description, journal_type, status, reference)
  values (
    p_church_id,
    (timezone('utc', now()))::date,
    'Online giving — ' || coalesce(gift.fund_designation, 'General Fund'),
    'giving',
    'posted',
    p_donation_id::text
  )
  returning id into new_journal_id;

  memo := 'Donation ' || right(p_donation_id::text, 8);
  insert into public.finance_journal_lines (journal_id, church_id, account_id, side, amount_cents, memo, sort_order)
  values
    (new_journal_id, p_church_id, mapping.asset_account_id, 'debit', gift.amount_cents, memo, 0),
    (new_journal_id, p_church_id, mapping.income_account_id, 'credit', gift.amount_cents, memo, 1);

  insert into public.donation_gl_posts (church_id, donation_id, journal_id, status)
  values (p_church_id, p_donation_id, new_journal_id, 'posted');

  return 'posted';
end;
$$;

revoke all on function public.post_donation_to_gl(uuid, uuid) from public, anon, authenticated;
grant execute on function public.post_donation_to_gl(uuid, uuid) to service_role;

-- The church's "Recurring gift" product on its Stripe account: a
-- subscription's price must name one, so it's created once per account.
alter table public.church_payment_accounts add column stripe_recurring_product_id text;
