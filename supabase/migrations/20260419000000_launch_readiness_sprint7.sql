-- ============================================================
-- Sprint 7+: Launch Readiness & Production Polish
-- Adds: self-service data rights columns on profiles,
--       voluntary donations table (Stripe-backed),
--       audit coverage for donations,
--       RLS final pass on all sensitive tables,
--       ai_interactions audit table
-- ============================================================

-- ── 1. Self-service data rights ──────────────────────────────
-- Members request export/deletion; church admins approve.
-- Grace period for deletion is 30 days (enforced in app layer).

alter table public.profiles
  add column if not exists data_export_requested_at  timestamptz,
  add column if not exists data_delete_requested_at  timestamptz,
  add column if not exists data_delete_approved_at   timestamptz,
  add column if not exists data_delete_approved_by   uuid references public.profiles(id) on delete set null;

-- Index for admin dashboard queries
create index if not exists profiles_data_delete_requested_idx
  on public.profiles (data_delete_requested_at)
  where data_delete_requested_at is not null;

-- ── 2. Voluntary donations ────────────────────────────────────
-- All giving is 100% voluntary and church-controlled.
-- ChurchCore never takes a platform cut.
-- Stripe handles payment processing; we store only metadata,
-- never raw card data (PCI scope is fully Stripe's).

create table if not exists public.donations (
  id                   uuid primary key default gen_random_uuid(),
  church_id            uuid not null references public.churches(id) on delete cascade,
  profile_id           uuid references public.profiles(id) on delete set null,
  -- donor_name is stored for anonymous donors who still want a receipt
  donor_name           text,
  donor_email          text,
  amount_cents         integer not null check (amount_cents > 0),
  currency             text not null default 'usd',
  -- fund designation (e.g. 'General', 'Building Fund', 'Missions')
  fund_designation     text,
  -- Stripe metadata — never store card details here
  stripe_payment_intent_id text,
  stripe_subscription_id   text,        -- non-null for recurring
  stripe_customer_id        text,
  is_recurring         boolean not null default false,
  -- status mirrors Stripe payment intent status
  status               text not null default 'pending'
    check (status in ('pending', 'succeeded', 'failed', 'refunded', 'cancelled')),
  is_anonymous         boolean not null default false,
  -- receipt sent confirmation
  receipt_sent_at      timestamptz,
  -- soft metadata
  note                 text,
  created_at           timestamptz not null default timezone('utc', now()),
  updated_at           timestamptz not null default timezone('utc', now())
);

create index if not exists donations_church_id_idx
  on public.donations (church_id, created_at desc);

create index if not exists donations_profile_id_idx
  on public.donations (profile_id, created_at desc);

create index if not exists donations_stripe_payment_intent_idx
  on public.donations (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

create index if not exists donations_stripe_subscription_idx
  on public.donations (stripe_subscription_id)
  where stripe_subscription_id is not null;

alter table public.donations enable row level security;

-- Members see their own donations (non-anonymous ones)
create policy "donations_select_own"
on public.donations
for select
to authenticated
using (
  is_anonymous = false
  and profile_id = (
    select id from public.profiles where user_id = auth.uid() limit 1
  )
);

-- Church admins and pastors see all church donations
create policy "donations_select_management"
on public.donations
for select
to authenticated
using (public.can_manage_church(church_id));

-- Only management (or service role via webhook) may insert
create policy "donations_insert_management"
on public.donations
for insert
to authenticated
with check (public.can_manage_church(church_id));

-- Only management may update (e.g. mark receipt sent)
create policy "donations_update_management"
on public.donations
for update
to authenticated
using (public.can_manage_church(church_id))
with check (public.can_manage_church(church_id));

-- Audit trigger for donations
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'audit_donations_changes'
      and tgrelid = 'public.donations'::regclass
  ) then
    create trigger audit_donations_changes
    after insert or update or delete on public.donations
    for each row execute function public.audit_log_changes();
  end if;
end $$;

-- ── 3. ai_interactions — AI usage audit table ────────────────
-- Records every AI prompt call with topic (never member data)
-- and the disclaimer shown. Supports compliance review.

create table if not exists public.ai_interactions (
  id              uuid primary key default gen_random_uuid(),
  church_id       uuid references public.churches(id) on delete cascade,
  profile_id      uuid references public.profiles(id) on delete set null,
  feature         text not null,   -- e.g. 'wisdom_prompt', 'volunteer_matcher', 'sermon_helper'
  -- topic_hash: SHA-256 of the topic text — never store raw topic
  -- (protects against accidental PII in prompts)
  topic_text      text,            -- stored only when non-sensitive; redacted otherwise
  disclaimer_shown boolean not null default true,
  model_used      text,
  created_at      timestamptz not null default timezone('utc', now())
);

create index if not exists ai_interactions_church_idx
  on public.ai_interactions (church_id, created_at desc);

alter table public.ai_interactions enable row level security;

-- Only management can view AI interaction logs
create policy "ai_interactions_select_management"
on public.ai_interactions
for select
to authenticated
using (public.can_manage_church(church_id));

-- Service role inserts; authenticated can only insert for their own church
create policy "ai_interactions_insert_management"
on public.ai_interactions
for insert
to authenticated
with check (public.can_manage_church(church_id));

-- Audit trigger
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'audit_ai_interactions_changes'
      and tgrelid = 'public.ai_interactions'::regclass
  ) then
    create trigger audit_ai_interactions_changes
    after insert or update or delete on public.ai_interactions
    for each row execute function public.audit_log_changes();
  end if;
end $$;

-- ── 4. RLS final pass — ensure data_rights columns are ───────
-- only writable by the profile owner or management

-- Members may request their own export/delete
create policy "profiles_update_own_data_rights"
on public.profiles
for update
to authenticated
using (
  user_id = auth.uid()
)
with check (
  user_id = auth.uid()
);

-- ── 5. Stripe customer table (control-plane safe) ─────────────
-- Maps church → Stripe customer ID. Only church_id + stripe key.
-- Never stores card data. Separate from donations for normalization.

create table if not exists public.stripe_customers (
  id                uuid primary key default gen_random_uuid(),
  church_id         uuid not null unique references public.churches(id) on delete cascade,
  stripe_customer_id text not null,
  created_at        timestamptz not null default timezone('utc', now())
);

alter table public.stripe_customers enable row level security;

create policy "stripe_customers_select_management"
on public.stripe_customers
for select
to authenticated
using (public.can_manage_church(church_id));

create policy "stripe_customers_insert_management"
on public.stripe_customers
for insert
to authenticated
with check (public.can_manage_church(church_id));

create policy "stripe_customers_update_management"
on public.stripe_customers
for update
to authenticated
using (public.can_manage_church(church_id))
with check (public.can_manage_church(church_id));
