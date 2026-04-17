import { redirect } from "next/navigation";

import { FinanceBudgetWorkspace } from "@/components/application/finance-budget-workspace";
import { requireChurchSession } from "@/lib/auth";
import { getFinanceBudgets, getFinanceBudgetLines, getFinanceAccounts, getBudgetVariance } from "@/lib/finance-data";

export default async function BudgetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireChurchSession("/app/church-admin");
  if (session.appContext.roleId !== "church-admin") redirect(session.homePath);

  const { id } = await params;
  const [budgets, budgetLines, accounts, varianceRows] = await Promise.all([
    getFinanceBudgets(session),
    getFinanceBudgetLines(session, id),
    getFinanceAccounts(session),
    getBudgetVariance(session, id),
  ]);

  return (
    <FinanceBudgetWorkspace
      session={session}
      budgets={budgets}
      selectedBudgetId={id}
      budgetLines={budgetLines}
      varianceRows={varianceRows}
      accounts={accounts}
    />
  );
}
