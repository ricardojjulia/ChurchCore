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

create policy "recurring_gifts_select_management" on public.recurring_gifts
  for select to authenticated
  using (public.can_manage_church(church_id));

revoke all on public.recurring_gifts from anon;

-- Installments and the retry-safe completion of every gift (G3.2).
alter table public.donations
  add column recurring_gift_id uuid references public.recurring_gifts (id) on delete set null,
  -- One donation per Stripe invoice: a retried invoice.paid finds it.
  add column stripe_invoice_id text unique,
  -- Written last, once the gift is posted to the ledger and its receipt is
  -- sent: a webhook retry resumes any gift without it.
  add column completed_at timestamptz,
  -- The donor was told this installment failed (sent once per invoice).
  add column failure_notice_sent_at timestamptz;

create index donations_recurring_gift_idx on public.donations (recurring_gift_id);

-- Gifts already succeeded before this migration were completed by the old
-- path (ledger and receipt in the same handler).
update public.donations set completed_at = updated_at where status = 'succeeded' and completed_at is null;

-- The church's "Recurring gift" product on its Stripe account: a
-- subscription's price must name one, so it's created once per account.
alter table public.church_payment_accounts add column stripe_recurring_product_id text;
