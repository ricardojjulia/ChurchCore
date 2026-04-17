-- ============================================================
-- Financial Management Module
-- Adds: chart of accounts, double-entry journals, budgets,
--       import job log, and RLS policies.
-- All monetary values stored as integer cents (USD-compatible).
-- Access: church-admin only via can_manage_church() helper.
-- ============================================================

-- ── 1. Chart of Accounts ─────────────────────────────────────
-- Hierarchical (parent_id self-ref) list of accounts.
-- account_type drives income-statement vs balance-sheet placement.
-- account_code is the human-readable number (e.g. "5100").

create table if not exists public.finance_accounts (
  id            uuid primary key default gen_random_uuid(),
  church_id     uuid not null references public.churches(id) on delete cascade,
  parent_id     uuid references public.finance_accounts(id) on delete set null,
  account_code  text not null,
  name          text not null,
  description   text,
  account_type  text not null
    check (account_type in ('asset', 'liability', 'equity', 'income', 'expense')),
  is_active     boolean not null default true,
  created_at    timestamptz not null default timezone('utc', now()),
  updated_at    timestamptz not null default timezone('utc', now()),
  unique (church_id, account_code)
);

create index if not exists finance_accounts_church_idx
  on public.finance_accounts (church_id, account_type, account_code);

alter table public.finance_accounts enable row level security;

create policy "finance_accounts_select"
on public.finance_accounts for select to authenticated
using (public.can_manage_church(church_id));

create policy "finance_accounts_insert"
on public.finance_accounts for insert to authenticated
with check (public.can_manage_church(church_id));

create policy "finance_accounts_update"
on public.finance_accounts for update to authenticated
using (public.can_manage_church(church_id))
with check (public.can_manage_church(church_id));

create policy "finance_accounts_delete"
on public.finance_accounts for delete to authenticated
using (public.can_manage_church(church_id));

-- ── 2. Journal Batches ────────────────────────────────────────
-- A journal groups related debit/credit lines.
-- status: draft (editable) → posted (locked) | voided.
-- journal_type: general | bank_feed | accounts_payable | import

create table if not exists public.finance_journals (
  id            uuid primary key default gen_random_uuid(),
  church_id     uuid not null references public.churches(id) on delete cascade,
  journal_date  date not null,
  description   text not null,
  journal_type  text not null default 'general'
    check (journal_type in ('general', 'bank_feed', 'accounts_payable', 'import')),
  status        text not null default 'draft'
    check (status in ('draft', 'posted', 'voided')),
  reference     text,          -- external reference (check #, invoice #, etc.)
  posted_by     uuid references public.profiles(id) on delete set null,
  posted_at     timestamptz,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default timezone('utc', now()),
  updated_at    timestamptz not null default timezone('utc', now())
);

create index if not exists finance_journals_church_idx
  on public.finance_journals (church_id, journal_date desc, status);

alter table public.finance_journals enable row level security;

create policy "finance_journals_select"
on public.finance_journals for select to authenticated
using (public.can_manage_church(church_id));

create policy "finance_journals_insert"
on public.finance_journals for insert to authenticated
with check (public.can_manage_church(church_id));

create policy "finance_journals_update"
on public.finance_journals for update to authenticated
using (public.can_manage_church(church_id))
with check (public.can_manage_church(church_id));

create policy "finance_journals_delete"
on public.finance_journals for delete to authenticated
using (public.can_manage_church(church_id));

-- ── 3. Journal Lines (double-entry) ──────────────────────────
-- Each line is either a debit or credit to one account.
-- Business rule (enforced in app): sum of debits = sum of credits
-- for every journal.

create table if not exists public.finance_journal_lines (
  id            uuid primary key default gen_random_uuid(),
  journal_id    uuid not null references public.finance_journals(id) on delete cascade,
  church_id     uuid not null references public.churches(id) on delete cascade,
  account_id    uuid not null references public.finance_accounts(id) on delete restrict,
  side          text not null check (side in ('debit', 'credit')),
  amount_cents  integer not null check (amount_cents > 0),
  memo          text,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default timezone('utc', now())
);

create index if not exists finance_journal_lines_journal_idx
  on public.finance_journal_lines (journal_id);

create index if not exists finance_journal_lines_account_idx
  on public.finance_journal_lines (account_id, church_id);

alter table public.finance_journal_lines enable row level security;

create policy "finance_journal_lines_select"
on public.finance_journal_lines for select to authenticated
using (public.can_manage_church(church_id));

create policy "finance_journal_lines_insert"
on public.finance_journal_lines for insert to authenticated
with check (public.can_manage_church(church_id));

create policy "finance_journal_lines_update"
on public.finance_journal_lines for update to authenticated
using (public.can_manage_church(church_id))
with check (public.can_manage_church(church_id));

create policy "finance_journal_lines_delete"
on public.finance_journal_lines for delete to authenticated
using (public.can_manage_church(church_id));

-- ── 4. Budgets ────────────────────────────────────────────────
-- One budget per fiscal year (or named revision).
-- is_active: only one budget should be active per fiscal_year in practice
-- (enforced at app layer for flexibility).

create table if not exists public.finance_budgets (
  id            uuid primary key default gen_random_uuid(),
  church_id     uuid not null references public.churches(id) on delete cascade,
  name          text not null,
  fiscal_year   integer not null,  -- e.g. 2026
  notes         text,
  is_active     boolean not null default true,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default timezone('utc', now()),
  updated_at    timestamptz not null default timezone('utc', now())
);

create index if not exists finance_budgets_church_idx
  on public.finance_budgets (church_id, fiscal_year desc);

alter table public.finance_budgets enable row level security;

create policy "finance_budgets_select"
on public.finance_budgets for select to authenticated
using (public.can_manage_church(church_id));

create policy "finance_budgets_insert"
on public.finance_budgets for insert to authenticated
with check (public.can_manage_church(church_id));

create policy "finance_budgets_update"
on public.finance_budgets for update to authenticated
using (public.can_manage_church(church_id))
with check (public.can_manage_church(church_id));

create policy "finance_budgets_delete"
on public.finance_budgets for delete to authenticated
using (public.can_manage_church(church_id));

-- ── 5. Budget Lines ───────────────────────────────────────────
-- Budgeted amount per account per budget.
-- One row per account in the budget; amount_cents is the annual target.

create table if not exists public.finance_budget_lines (
  id             uuid primary key default gen_random_uuid(),
  budget_id      uuid not null references public.finance_budgets(id) on delete cascade,
  church_id      uuid not null references public.churches(id) on delete cascade,
  account_id     uuid not null references public.finance_accounts(id) on delete restrict,
  amount_cents   integer not null default 0 check (amount_cents >= 0),
  notes          text,
  created_at     timestamptz not null default timezone('utc', now()),
  updated_at     timestamptz not null default timezone('utc', now()),
  unique (budget_id, account_id)
);

create index if not exists finance_budget_lines_budget_idx
  on public.finance_budget_lines (budget_id);

alter table public.finance_budget_lines enable row level security;

create policy "finance_budget_lines_select"
on public.finance_budget_lines for select to authenticated
using (public.can_manage_church(church_id));

create policy "finance_budget_lines_insert"
on public.finance_budget_lines for insert to authenticated
with check (public.can_manage_church(church_id));

create policy "finance_budget_lines_update"
on public.finance_budget_lines for update to authenticated
using (public.can_manage_church(church_id))
with check (public.can_manage_church(church_id));

create policy "finance_budget_lines_delete"
on public.finance_budget_lines for delete to authenticated
using (public.can_manage_church(church_id));

-- ── 6. Import Jobs ────────────────────────────────────────────
-- Records each import attempt for auditability.
-- format: csv | xlsx | quickbooks_iif | ofx | txt
-- status: pending | processing | completed | failed

create table if not exists public.finance_imports (
  id              uuid primary key default gen_random_uuid(),
  church_id       uuid not null references public.churches(id) on delete cascade,
  filename        text not null,
  format          text not null
    check (format in ('csv', 'xlsx', 'quickbooks_iif', 'ofx', 'txt')),
  status          text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  total_rows      integer,
  imported_rows   integer,
  error_message   text,
  journal_id      uuid references public.finance_journals(id) on delete set null,
  imported_by     uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default timezone('utc', now()),
  updated_at      timestamptz not null default timezone('utc', now())
);

create index if not exists finance_imports_church_idx
  on public.finance_imports (church_id, created_at desc);

alter table public.finance_imports enable row level security;

create policy "finance_imports_select"
on public.finance_imports for select to authenticated
using (public.can_manage_church(church_id));

create policy "finance_imports_insert"
on public.finance_imports for insert to authenticated
with check (public.can_manage_church(church_id));

create policy "finance_imports_update"
on public.finance_imports for update to authenticated
using (public.can_manage_church(church_id))
with check (public.can_manage_church(church_id));

-- ── 7. Audit triggers ────────────────────────────────────────

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'audit_finance_journals_changes'
      and tgrelid = 'public.finance_journals'::regclass
  ) then
    create trigger audit_finance_journals_changes
    after insert or update or delete on public.finance_journals
    for each row execute function public.audit_log_changes();
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'audit_finance_accounts_changes'
      and tgrelid = 'public.finance_accounts'::regclass
  ) then
    create trigger audit_finance_accounts_changes
    after insert or update or delete on public.finance_accounts
    for each row execute function public.audit_log_changes();
  end if;
end $$;
