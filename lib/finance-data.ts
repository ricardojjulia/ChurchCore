import "server-only";

import {
  createTenantServerClient,
  hasTenantBackendEnv,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";
import type { ChurchAppSession } from "@/lib/auth";
import type {
  FinanceAccount,
  FinanceBudget,
  FinanceBudgetLine,
  FinanceDashboardData,
  FinanceImport,
  FinanceJournal,
  FinanceJournalLine,
  FinanceJournalWithLines,
  BudgetVarianceRow,
  IncomeStatementData,
  BalanceSheetData,
} from "@/lib/finance-types";

// ── Mappers ──────────────────────────────────────────────────

function mapAccount(r: {
  id: string;
  church_id: string;
  parent_id: string | null;
  account_code: string;
  name: string;
  description: string | null;
  account_type: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}): FinanceAccount {
  return {
    id: r.id,
    churchId: r.church_id,
    parentId: r.parent_id,
    accountCode: r.account_code,
    name: r.name,
    description: r.description,
    accountType: r.account_type as FinanceAccount["accountType"],
    isActive: r.is_active,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapJournal(r: {
  id: string;
  church_id: string;
  journal_date: string;
  description: string;
  journal_type: string;
  status: string;
  reference: string | null;
  posted_by: string | null;
  posted_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}): FinanceJournal {
  return {
    id: r.id,
    churchId: r.church_id,
    journalDate: r.journal_date,
    description: r.description,
    journalType: r.journal_type as FinanceJournal["journalType"],
    status: r.status as FinanceJournal["status"],
    reference: r.reference,
    postedBy: r.posted_by,
    postedAt: r.posted_at,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapJournalLine(r: {
  id: string;
  journal_id: string;
  church_id: string;
  account_id: string;
  side: string;
  amount_cents: number;
  memo: string | null;
  sort_order: number;
  created_at: string;
}): FinanceJournalLine {
  return {
    id: r.id,
    journalId: r.journal_id,
    churchId: r.church_id,
    accountId: r.account_id,
    side: r.side as FinanceJournalLine["side"],
    amountCents: r.amount_cents,
    memo: r.memo,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
  };
}

function mapBudget(r: {
  id: string;
  church_id: string;
  name: string;
  fiscal_year: number;
  notes: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}): FinanceBudget {
  return {
    id: r.id,
    churchId: r.church_id,
    name: r.name,
    fiscalYear: r.fiscal_year,
    notes: r.notes,
    isActive: r.is_active,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapBudgetLine(r: {
  id: string;
  budget_id: string;
  church_id: string;
  account_id: string;
  amount_cents: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}): FinanceBudgetLine {
  return {
    id: r.id,
    budgetId: r.budget_id,
    churchId: r.church_id,
    accountId: r.account_id,
    amountCents: r.amount_cents,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapImport(r: {
  id: string;
  church_id: string;
  filename: string;
  format: string;
  status: string;
  total_rows: number | null;
  imported_rows: number | null;
  error_message: string | null;
  journal_id: string | null;
  imported_by: string | null;
  created_at: string;
  updated_at: string;
}): FinanceImport {
  return {
    id: r.id,
    churchId: r.church_id,
    filename: r.filename,
    format: r.format as FinanceImport["format"],
    status: r.status as FinanceImport["status"],
    totalRows: r.total_rows,
    importedRows: r.imported_rows,
    errorMessage: r.error_message,
    journalId: r.journal_id,
    importedBy: r.imported_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// ── Empty fallbacks ──────────────────────────────────────────

const EMPTY_DASHBOARD: FinanceDashboardData = {
  totalIncomeCents: 0,
  totalExpenseCents: 0,
  netCents: 0,
  budgetUtilizationPercent: null,
  recentJournals: [],
  incomeByAccount: [],
  expenseByAccount: [],
};

// ── Chart of Accounts ────────────────────────────────────────

export async function getFinanceAccounts(
  session: ChurchAppSession,
): Promise<FinanceAccount[]> {
  if (!hasTenantBackendEnv() || session.source !== "supabase") return [];

  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{
      id: string; church_id: string; parent_id: string | null;
      account_code: string; name: string; description: string | null;
      account_type: string; is_active: boolean; created_at: string; updated_at: string;
    }>(
      `select id, church_id, parent_id, account_code, name, description,
              account_type, is_active, created_at, updated_at
       from public.finance_accounts
       where church_id = $1
       order by account_type, account_code`,
      [churchId],
    );
    return result.rows.map(mapAccount);
  }

  const supabase = await createTenantServerClient();
  const { data } = await supabase
    .from("finance_accounts")
    .select("*")
    .eq("church_id", churchId)
    .order("account_code");

  return (data ?? []).map((r) => mapAccount(r as Parameters<typeof mapAccount>[0]));
}

// ── Journals ─────────────────────────────────────────────────

export async function getFinanceJournals(
  session: ChurchAppSession,
  limit = 50,
): Promise<FinanceJournal[]> {
  if (!hasTenantBackendEnv() || session.source !== "supabase") return [];

  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{
      id: string; church_id: string; journal_date: string; description: string;
      journal_type: string; status: string; reference: string | null;
      posted_by: string | null; posted_at: string | null; created_by: string | null;
      created_at: string; updated_at: string;
    }>(
      `select id, church_id, journal_date, description, journal_type, status,
              reference, posted_by, posted_at, created_by, created_at, updated_at
       from public.finance_journals
       where church_id = $1
       order by journal_date desc, created_at desc
       limit $2`,
      [churchId, limit],
    );
    return result.rows.map(mapJournal);
  }

  const supabase = await createTenantServerClient();
  const { data } = await supabase
    .from("finance_journals")
    .select("*")
    .eq("church_id", churchId)
    .order("journal_date", { ascending: false })
    .limit(limit);

  return (data ?? []).map((r) => mapJournal(r as Parameters<typeof mapJournal>[0]));
}

export async function getFinanceJournalWithLines(
  session: ChurchAppSession,
  journalId: string,
): Promise<FinanceJournalWithLines | null> {
  if (!hasTenantBackendEnv() || session.source !== "supabase") return null;

  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    const [jResult, lResult] = await Promise.all([
      queryTenantLocalDb<{
        id: string; church_id: string; journal_date: string; description: string;
        journal_type: string; status: string; reference: string | null;
        posted_by: string | null; posted_at: string | null; created_by: string | null;
        created_at: string; updated_at: string;
      }>(
        `select * from public.finance_journals where id = $1 and church_id = $2`,
        [journalId, churchId],
      ),
      queryTenantLocalDb<{
        id: string; journal_id: string; church_id: string; account_id: string;
        side: string; amount_cents: number; memo: string | null; sort_order: number;
        created_at: string; account_name: string; account_code: string;
      }>(
        `select jl.*, a.name as account_name, a.account_code
         from public.finance_journal_lines jl
         join public.finance_accounts a on a.id = jl.account_id
         where jl.journal_id = $1
         order by jl.sort_order`,
        [journalId],
      ),
    ]);

    if (!jResult.rows[0]) return null;
    const journal = mapJournal(jResult.rows[0]);
    const lines = lResult.rows.map((r) => ({
      ...mapJournalLine(r),
      accountName: r.account_name,
      accountCode: r.account_code,
    }));
    return { ...journal, lines };
  }

  const supabase = await createTenantServerClient();
  const { data: jData } = await supabase
    .from("finance_journals")
    .select("*")
    .eq("id", journalId)
    .eq("church_id", churchId)
    .single();

  if (!jData) return null;

  const { data: lData } = await supabase
    .from("finance_journal_lines")
    .select("*, finance_accounts(name, account_code)")
    .eq("journal_id", journalId)
    .order("sort_order");

  const lines = (lData ?? []).map((r) => {
    const acct = r.finance_accounts as { name: string; account_code: string } | null;
    return {
      ...mapJournalLine(r as Parameters<typeof mapJournalLine>[0]),
      accountName: acct?.name ?? "",
      accountCode: acct?.account_code ?? "",
    };
  });

  return { ...mapJournal(jData as Parameters<typeof mapJournal>[0]), lines };
}

// ── Budgets ──────────────────────────────────────────────────

export async function getFinanceBudgets(
  session: ChurchAppSession,
): Promise<FinanceBudget[]> {
  if (!hasTenantBackendEnv() || session.source !== "supabase") return [];

  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{
      id: string; church_id: string; name: string; fiscal_year: number;
      notes: string | null; is_active: boolean; created_by: string | null;
      created_at: string; updated_at: string;
    }>(
      `select * from public.finance_budgets where church_id = $1 order by fiscal_year desc`,
      [churchId],
    );
    return result.rows.map(mapBudget);
  }

  const supabase = await createTenantServerClient();
  const { data } = await supabase
    .from("finance_budgets")
    .select("*")
    .eq("church_id", churchId)
    .order("fiscal_year", { ascending: false });

  return (data ?? []).map((r) => mapBudget(r as Parameters<typeof mapBudget>[0]));
}

export async function getBudgetVariance(
  session: ChurchAppSession,
  budgetId: string,
): Promise<BudgetVarianceRow[]> {
  if (!hasTenantBackendEnv() || session.source !== "supabase") return [];

  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{
      account_id: string;
      account_code: string;
      account_name: string;
      account_type: string;
      budgeted_cents: number;
      actual_credits: number;
      actual_debits: number;
    }>(
      `select
         a.id            as account_id,
         a.account_code,
         a.name          as account_name,
         a.account_type,
         coalesce(bl.amount_cents, 0)  as budgeted_cents,
         coalesce(sum(jl.amount_cents) filter (where jl.side = 'credit'), 0)::int as actual_credits,
         coalesce(sum(jl.amount_cents) filter (where jl.side = 'debit'),  0)::int as actual_debits
       from public.finance_budget_lines bl
       join public.finance_accounts a on a.id = bl.account_id
       join public.finance_budgets  b on b.id = bl.budget_id
       left join public.finance_journal_lines jl on jl.account_id = a.id
         and jl.church_id = $1
       left join public.finance_journals j on j.id = jl.journal_id
         and j.status = 'posted'
         and extract(year from j.journal_date) = b.fiscal_year
       where bl.budget_id = $2 and bl.church_id = $1
       group by a.id, a.account_code, a.name, a.account_type, bl.amount_cents
       order by a.account_type, a.account_code`,
      [churchId, budgetId],
    );

    return result.rows.map((r) => {
      const actualCents =
        r.account_type === "expense" || r.account_type === "asset"
          ? r.actual_debits - r.actual_credits
          : r.actual_credits - r.actual_debits;
      return {
        accountId: r.account_id,
        accountCode: r.account_code,
        accountName: r.account_name,
        accountType: r.account_type as BudgetVarianceRow["accountType"],
        budgetedCents: r.budgeted_cents,
        actualCents,
        varianceCents: actualCents - r.budgeted_cents,
      };
    });
  }

  // Supabase client path — use RPC or multiple queries
  const supabase = await createTenantServerClient();
  const { data: lines } = await supabase
    .from("finance_budget_lines")
    .select("*, finance_accounts(*), finance_budgets(fiscal_year)")
    .eq("budget_id", budgetId)
    .eq("church_id", churchId);

  return (lines ?? []).map((bl) => {
    const acct = bl.finance_accounts as FinanceAccount | null;
    return {
      accountId: bl.account_id,
      accountCode: acct?.accountCode ?? "",
      accountName: acct?.name ?? "",
      accountType: (acct?.accountType ?? "expense") as BudgetVarianceRow["accountType"],
      budgetedCents: bl.amount_cents,
      actualCents: 0, // actuals require a separate join; computed server-side in action
      varianceCents: -bl.amount_cents,
    };
  });
}

// ── Import Jobs ──────────────────────────────────────────────

export async function getFinanceImports(
  session: ChurchAppSession,
): Promise<FinanceImport[]> {
  if (!hasTenantBackendEnv() || session.source !== "supabase") return [];

  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{
      id: string; church_id: string; filename: string; format: string;
      status: string; total_rows: number | null; imported_rows: number | null;
      error_message: string | null; journal_id: string | null;
      imported_by: string | null; created_at: string; updated_at: string;
    }>(
      `select * from public.finance_imports where church_id = $1 order by created_at desc limit 50`,
      [churchId],
    );
    return result.rows.map(mapImport);
  }

  const supabase = await createTenantServerClient();
  const { data } = await supabase
    .from("finance_imports")
    .select("*")
    .eq("church_id", churchId)
    .order("created_at", { ascending: false })
    .limit(50);

  return (data ?? []).map((r) => mapImport(r as Parameters<typeof mapImport>[0]));
}

// ── Dashboard ────────────────────────────────────────────────

export async function getFinanceDashboardData(
  session: ChurchAppSession,
): Promise<FinanceDashboardData> {
  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    return EMPTY_DASHBOARD;
  }

  const churchId = session.appContext.church.id;
  const currentYear = new Date().getFullYear();

  if (shouldUseLocalTenantFallback()) {
    const [totalsResult, byAccountResult, recentResult, budgetResult] = await Promise.all([
      queryTenantLocalDb<{
        account_type: string;
        total_credits: number;
        total_debits: number;
      }>(
        `select
           a.account_type,
           coalesce(sum(jl.amount_cents) filter (where jl.side = 'credit'), 0)::int as total_credits,
           coalesce(sum(jl.amount_cents) filter (where jl.side = 'debit'),  0)::int as total_debits
         from public.finance_journal_lines jl
         join public.finance_journals j on j.id = jl.journal_id
           and j.church_id = $1 and j.status = 'posted'
           and extract(year from j.journal_date) = $2
         join public.finance_accounts a on a.id = jl.account_id
         group by a.account_type`,
        [churchId, currentYear],
      ),
      queryTenantLocalDb<{
        account_type: string;
        account_name: string;
        amount_cents: number;
      }>(
        `select
           a.account_type,
           a.name as account_name,
           abs(
             coalesce(sum(jl.amount_cents) filter (where jl.side = 'credit'), 0) -
             coalesce(sum(jl.amount_cents) filter (where jl.side = 'debit'),  0)
           )::int as amount_cents
         from public.finance_journal_lines jl
         join public.finance_journals j on j.id = jl.journal_id
           and j.church_id = $1 and j.status = 'posted'
           and extract(year from j.journal_date) = $2
         join public.finance_accounts a on a.id = jl.account_id
         where a.account_type in ('income', 'expense')
         group by a.account_type, a.name
         order by amount_cents desc`,
        [churchId, currentYear],
      ),
      queryTenantLocalDb<{
        id: string; church_id: string; journal_date: string; description: string;
        journal_type: string; status: string; reference: string | null;
        posted_by: string | null; posted_at: string | null; created_by: string | null;
        created_at: string; updated_at: string;
      }>(
        `select * from public.finance_journals where church_id = $1
         order by journal_date desc, created_at desc limit 10`,
        [churchId],
      ),
      queryTenantLocalDb<{ total_budget_cents: number; total_actual_cents: number }>(
        `select
           coalesce(sum(bl.amount_cents), 0)::int as total_budget_cents,
           coalesce(sum(
             abs(
               coalesce(sum2.credits, 0) - coalesce(sum2.debits, 0)
             )
           ), 0)::int as total_actual_cents
         from public.finance_budgets b
         join public.finance_budget_lines bl on bl.budget_id = b.id
         left join lateral (
           select
             coalesce(sum(jl.amount_cents) filter (where jl.side = 'credit'), 0) as credits,
             coalesce(sum(jl.amount_cents) filter (where jl.side = 'debit'),  0) as debits
           from public.finance_journal_lines jl
           join public.finance_journals j on j.id = jl.journal_id
             and j.status = 'posted' and extract(year from j.journal_date) = b.fiscal_year
           where jl.account_id = bl.account_id
         ) sum2 on true
         where b.church_id = $1 and b.is_active = true and b.fiscal_year = $2`,
        [churchId, currentYear],
      ),
    ]);

    let totalIncomeCents = 0;
    let totalExpenseCents = 0;
    for (const row of totalsResult.rows) {
      if (row.account_type === "income") {
        totalIncomeCents = row.total_credits - row.total_debits;
      } else if (row.account_type === "expense") {
        totalExpenseCents = row.total_debits - row.total_credits;
      }
    }

    const budgetRow = budgetResult.rows[0];
    const budgetUtilizationPercent =
      budgetRow && budgetRow.total_budget_cents > 0
        ? Math.round((budgetRow.total_actual_cents / budgetRow.total_budget_cents) * 100)
        : null;

    return {
      totalIncomeCents,
      totalExpenseCents,
      netCents: totalIncomeCents - totalExpenseCents,
      budgetUtilizationPercent,
      recentJournals: recentResult.rows.map(mapJournal),
      incomeByAccount: byAccountResult.rows
        .filter((r) => r.account_type === "income")
        .map((r) => ({ accountName: r.account_name, amountCents: r.amount_cents })),
      expenseByAccount: byAccountResult.rows
        .filter((r) => r.account_type === "expense")
        .map((r) => ({ accountName: r.account_name, amountCents: r.amount_cents })),
    };
  }

  // Supabase client path — simplified (joins done with multiple queries)
  const supabase = await createTenantServerClient();
  const { data: recentData } = await supabase
    .from("finance_journals")
    .select("*")
    .eq("church_id", churchId)
    .order("journal_date", { ascending: false })
    .limit(10);

  return {
    ...EMPTY_DASHBOARD,
    recentJournals: (recentData ?? []).map((r) => mapJournal(r as Parameters<typeof mapJournal>[0])),
  };
}

// ── Income Statement ─────────────────────────────────────────

export async function getIncomeStatement(
  session: ChurchAppSession,
  fiscalYear: number,
): Promise<IncomeStatementData> {
  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    return { fiscalYear, incomeRows: [], expenseRows: [], totalIncomeCents: 0, totalExpenseCents: 0, netCents: 0 };
  }

  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{
      account_code: string;
      account_name: string;
      account_type: string;
      amount_cents: number;
    }>(
      `select
         a.account_code,
         a.name as account_name,
         a.account_type,
         (
           coalesce(sum(jl.amount_cents) filter (where jl.side = 'credit'), 0) -
           coalesce(sum(jl.amount_cents) filter (where jl.side = 'debit'),  0)
         )::int as amount_cents
       from public.finance_journal_lines jl
       join public.finance_journals j on j.id = jl.journal_id
         and j.church_id = $1 and j.status = 'posted'
         and extract(year from j.journal_date) = $2
       join public.finance_accounts a on a.id = jl.account_id
       where a.account_type in ('income', 'expense')
       group by a.account_code, a.name, a.account_type
       order by a.account_type, a.account_code`,
      [churchId, fiscalYear],
    );

    const incomeRows = result.rows
      .filter((r) => r.account_type === "income")
      .map((r) => ({ accountCode: r.account_code, accountName: r.account_name, amountCents: r.amount_cents }));
    const expenseRows = result.rows
      .filter((r) => r.account_type === "expense")
      .map((r) => ({ accountCode: r.account_code, accountName: r.account_name, amountCents: Math.abs(r.amount_cents) }));

    const totalIncomeCents = incomeRows.reduce((s, r) => s + r.amountCents, 0);
    const totalExpenseCents = expenseRows.reduce((s, r) => s + r.amountCents, 0);

    return { fiscalYear, incomeRows, expenseRows, totalIncomeCents, totalExpenseCents, netCents: totalIncomeCents - totalExpenseCents };
  }

  return { fiscalYear, incomeRows: [], expenseRows: [], totalIncomeCents: 0, totalExpenseCents: 0, netCents: 0 };
}

// ── Balance Sheet ────────────────────────────────────────────

export async function getBalanceSheet(
  session: ChurchAppSession,
  asOfDate: string,
): Promise<BalanceSheetData> {
  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    return { asOfDate, assetRows: [], liabilityRows: [], equityRows: [], totalAssetsCents: 0, totalLiabilitiesCents: 0, totalEquityCents: 0 };
  }

  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{
      account_code: string;
      account_name: string;
      account_type: string;
      balance_cents: number;
    }>(
      `select
         a.account_code,
         a.name as account_name,
         a.account_type,
         (
           coalesce(sum(jl.amount_cents) filter (where jl.side = 'debit'),  0) -
           coalesce(sum(jl.amount_cents) filter (where jl.side = 'credit'), 0)
         )::int as balance_cents
       from public.finance_journal_lines jl
       join public.finance_journals j on j.id = jl.journal_id
         and j.church_id = $1 and j.status = 'posted'
         and j.journal_date <= $2
       join public.finance_accounts a on a.id = jl.account_id
       where a.account_type in ('asset', 'liability', 'equity')
       group by a.account_code, a.name, a.account_type
       order by a.account_type, a.account_code`,
      [churchId, asOfDate],
    );

    const assetRows = result.rows
      .filter((r) => r.account_type === "asset")
      .map((r) => ({ accountCode: r.account_code, accountName: r.account_name, balanceCents: r.balance_cents }));
    const liabilityRows = result.rows
      .filter((r) => r.account_type === "liability")
      .map((r) => ({ accountCode: r.account_code, accountName: r.account_name, balanceCents: Math.abs(r.balance_cents) }));
    const equityRows = result.rows
      .filter((r) => r.account_type === "equity")
      .map((r) => ({ accountCode: r.account_code, accountName: r.account_name, balanceCents: Math.abs(r.balance_cents) }));

    return {
      asOfDate,
      assetRows,
      liabilityRows,
      equityRows,
      totalAssetsCents: assetRows.reduce((s, r) => s + r.balanceCents, 0),
      totalLiabilitiesCents: liabilityRows.reduce((s, r) => s + r.balanceCents, 0),
      totalEquityCents: equityRows.reduce((s, r) => s + r.balanceCents, 0),
    };
  }

  return { asOfDate, assetRows: [], liabilityRows: [], equityRows: [], totalAssetsCents: 0, totalLiabilitiesCents: 0, totalEquityCents: 0 };
}

// Re-export budget line fetcher for budget detail page
export async function getFinanceBudgetLines(
  session: ChurchAppSession,
  budgetId: string,
): Promise<FinanceBudgetLine[]> {
  if (!hasTenantBackendEnv() || session.source !== "supabase") return [];

  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{
      id: string; budget_id: string; church_id: string; account_id: string;
      amount_cents: number; notes: string | null; created_at: string; updated_at: string;
    }>(
      `select * from public.finance_budget_lines where budget_id = $1 and church_id = $2`,
      [budgetId, churchId],
    );
    return result.rows.map(mapBudgetLine);
  }

  const supabase = await createTenantServerClient();
  const { data } = await supabase
    .from("finance_budget_lines")
    .select("*")
    .eq("budget_id", budgetId)
    .eq("church_id", churchId);

  return (data ?? []).map((r) => mapBudgetLine(r as Parameters<typeof mapBudgetLine>[0]));
}
