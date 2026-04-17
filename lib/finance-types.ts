// Shared TypeScript types for the Financial Management module.
// Mirroring the DB schema in finance_management migration.

export type AccountType = "asset" | "liability" | "equity" | "income" | "expense";
export type JournalStatus = "draft" | "posted" | "voided";
export type JournalType = "general" | "bank_feed" | "accounts_payable" | "import";
export type ImportFormat = "csv" | "xlsx" | "quickbooks_iif" | "ofx" | "txt";
export type ImportStatus = "pending" | "processing" | "completed" | "failed";
export type JournalLineSide = "debit" | "credit";

// ── Accounts ────────────────────────────────────────────────

export type FinanceAccount = {
  id: string;
  churchId: string;
  parentId: string | null;
  accountCode: string;
  name: string;
  description: string | null;
  accountType: AccountType;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type FinanceAccountWithBalance = FinanceAccount & {
  balanceCents: number; // current GL balance (debit-normal for asset/expense, credit-normal for liability/equity/income)
  children?: FinanceAccountWithBalance[];
};

// ── Journals ────────────────────────────────────────────────

export type FinanceJournal = {
  id: string;
  churchId: string;
  journalDate: string; // ISO date string "YYYY-MM-DD"
  description: string;
  journalType: JournalType;
  status: JournalStatus;
  reference: string | null;
  postedBy: string | null;
  postedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FinanceJournalLine = {
  id: string;
  journalId: string;
  churchId: string;
  accountId: string;
  side: JournalLineSide;
  amountCents: number;
  memo: string | null;
  sortOrder: number;
  createdAt: string;
};

export type FinanceJournalWithLines = FinanceJournal & {
  lines: (FinanceJournalLine & { accountName: string; accountCode: string })[];
};

// ── Budgets ─────────────────────────────────────────────────

export type FinanceBudget = {
  id: string;
  churchId: string;
  name: string;
  fiscalYear: number;
  notes: string | null;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FinanceBudgetLine = {
  id: string;
  budgetId: string;
  churchId: string;
  accountId: string;
  amountCents: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BudgetVarianceRow = {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  budgetedCents: number;
  actualCents: number;
  varianceCents: number; // actual - budgeted (negative = under budget for expenses = good)
};

// ── Imports ─────────────────────────────────────────────────

export type FinanceImport = {
  id: string;
  churchId: string;
  filename: string;
  format: ImportFormat;
  status: ImportStatus;
  totalRows: number | null;
  importedRows: number | null;
  errorMessage: string | null;
  journalId: string | null;
  importedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

// ── Dashboard / Report aggregates ───────────────────────────

export type FinanceDashboardData = {
  totalIncomeCents: number;
  totalExpenseCents: number;
  netCents: number;
  budgetUtilizationPercent: number | null; // null if no active budget
  recentJournals: FinanceJournal[];
  incomeByAccount: { accountName: string; amountCents: number }[];
  expenseByAccount: { accountName: string; amountCents: number }[];
};

export type IncomeStatementData = {
  fiscalYear: number;
  incomeRows: { accountCode: string; accountName: string; amountCents: number }[];
  expenseRows: { accountCode: string; accountName: string; amountCents: number }[];
  totalIncomeCents: number;
  totalExpenseCents: number;
  netCents: number;
};

export type BalanceSheetData = {
  asOfDate: string;
  assetRows: { accountCode: string; accountName: string; balanceCents: number }[];
  liabilityRows: { accountCode: string; accountName: string; balanceCents: number }[];
  equityRows: { accountCode: string; accountName: string; balanceCents: number }[];
  totalAssetsCents: number;
  totalLiabilitiesCents: number;
  totalEquityCents: number;
};

// ── Import wizard types ──────────────────────────────────────

export type ImportColumnMapping = {
  date: string | null;
  description: string | null;
  amount: string | null;
  debitAccount: string | null;
  creditAccount: string | null;
  reference: string | null;
};

export type ImportPreviewRow = {
  rowIndex: number;
  date: string;
  description: string;
  amountCents: number;
  debitAccountCode: string | null;
  creditAccountCode: string | null;
  reference: string | null;
  error: string | null;
};
