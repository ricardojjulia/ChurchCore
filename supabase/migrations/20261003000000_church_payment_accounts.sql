-- G3.0b (ADR 0025): each church's online payments run on its own Stripe
-- account (Connect, Standard, direct charges). This is the link from a church
-- to that account. Only the server writes it (church-scoped admin client,
-- ADR 0022): connecting (the OAuth callback), Stripe's account.updated and
-- account.application.deauthorized webhooks, and disconnecting. A church's
-- admins can read their own row to see the connection's status.

create table public.church_payment_accounts (
  church_id uuid primary key references public.churches (id) on delete cascade,
  stripe_account_id text not null unique,
  charges_enabled boolean not null default false,
  details_submitted boolean not null default false,
  connected_at timestamptz not null default timezone('utc', now()),
  disconnected_at timestamptz,
  connected_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.church_payment_accounts is
  'The Stripe Connect (Standard) account a church''s online payments are charged on (ADR 0025). Written only by the server.';

alter table public.church_payment_accounts enable row level security;

create policy "church_payment_accounts_read_church_admin" on public.church_payment_accounts
  for select to authenticated
  using (
    exists (
      select 1
      from public.church_memberships membership
      where membership.church_id = church_payment_accounts.church_id
        and membership.user_id = auth.uid()
        and membership.role = 'church_admin'
        and membership.is_active
    )
  );

revoke all on public.church_payment_accounts from anon;

-- Each payment remembers the account it was charged on. Status checks,
-- cancels, refunds and subscription cancels go to that account only while
-- it is still the church's connected account: disconnecting revokes
-- ChurchCore's access to it at Stripe, so payments made on it are then
-- managed from that account's own Stripe Dashboard, and ChurchCore says so
-- instead of acting on the church's new account. A church switches accounts
-- only by disconnecting first. Null for stubbed (keyless) and pre-Connect
-- rows.
alter table public.donations add column stripe_account_id text;
alter table public.event_registration_payments add column stripe_account_id text;
