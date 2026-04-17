import { redirect } from "next/navigation";

import { FinanceBudgetWorkspace } from "@/components/application/finance-budget-workspace";
import { requireChurchSession } from "@/lib/auth";
import { getFinanceBudgets } from "@/lib/finance-data";

export default async function FinanceBudgetsPage() {
  const session = await requireChurchSession("/app/church-admin");
  if (session.appContext.roleId !== "church-admin") redirect(session.homePath);

  const budgets = await getFinanceBudgets(session);
  return <FinanceBudgetWorkspace session={session} budgets={budgets} budgetLines={[]} varianceRows={[]} accounts={[]} />;
}
