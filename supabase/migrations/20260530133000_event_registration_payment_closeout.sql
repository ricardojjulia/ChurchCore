-- ============================================================
-- Event registration payment lifecycle closeout (Wave B)
-- ============================================================

-- ------------------------------------------------------------
-- 1) Ensure registration payment status column exists
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'event_registrations' and column_name = 'payment_status'
  ) then
    alter table public.event_registrations
      add column payment_status text not null default 'not_required';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'event_registrations_payment_status_check'
  ) then
    alter table public.event_registrations
      add constraint event_registrations_payment_status_check
      check (payment_status in ('not_required', 'pending', 'paid', 'failed', 'refunded'));
  end if;
end $$;

create index if not exists event_registrations_payment_status_idx
  on public.event_registrations (church_id, payment_status);

-- ------------------------------------------------------------
-- 2) Ledger table for registration payments
-- ------------------------------------------------------------

create table if not exists public.event_registration_payments (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.event_registrations (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  church_id uuid not null references public.churches (id) on delete cascade,
  provider text not null default 'stripe',
  payment_intent_id text,
  status text not null default 'pending',
  amount_cents int not null default 0,
  currency text not null default 'usd',
  failure_code text,
  failure_message text,
  follow_up_note text,
  followed_up_at timestamptz,
  reconciled_by uuid references public.profiles (id) on delete set null,
  reconciled_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (registration_id)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'event_registration_payments_status_check'
  ) then
    alter table public.event_registration_payments
      add constraint event_registration_payments_status_check
      check (status in ('pending', 'succeeded', 'failed', 'refunded', 'cancelled'));
  end if;
end $$;

create index if not exists event_registration_payments_church_status_idx
  on public.event_registration_payments (church_id, status);

create index if not exists event_registration_payments_intent_idx
  on public.event_registration_payments (payment_intent_id)
  where payment_intent_id is not null;

alter table public.event_registration_payments enable row level security;

create policy "event_registration_payments_manage"
  on public.event_registration_payments for all
  to authenticated
  using (public.can_manage_church(church_id))
  with check (public.can_manage_church(church_id));

create policy "event_registration_payments_read_member"
  on public.event_registration_payments for select
  to authenticated
  using (public.belongs_to_church(church_id));
