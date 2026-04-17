import { redirect } from "next/navigation";

import { FinanceReportsWorkspace } from "@/components/application/finance-reports-workspace";
import { requireChurchSession } from "@/lib/auth";
import { getIncomeStatement, getBalanceSheet, getFinanceBudgets, getBudgetVariance } from "@/lib/finance-data";

export default async function FinanceReportsPage() {
  const session = await requireChurchSession("/app/church-admin");
  if (session.appContext.roleId !== "church-admin") redirect(session.homePath);

  const currentYear = new Date().getFullYear();
  const today = new Date().toISOString().slice(0, 10);

  const [incomeStatement, balanceSheet, budgets] = await Promise.all([
    getIncomeStatement(session, currentYear),
    getBalanceSheet(session, today),
    getFinanceBudgets(session),
  ]);

  const activeBudget = budgets.find((b) => b.isActive && b.fiscalYear === currentYear) ?? null;
  const varianceRows = activeBudget
    ? await getBudgetVariance(session, activeBudget.id)
    : [];

  return (
    <FinanceReportsWorkspace
      session={session}
      incomeStatement={incomeStatement}
      balanceSheet={balanceSheet}
      varianceRows={varianceRows}
      activeBudgetName={activeBudget?.name ?? null}
    />
  );
}
