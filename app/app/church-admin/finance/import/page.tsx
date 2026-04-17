import { redirect } from "next/navigation";

import { FinanceImportWizard } from "@/components/application/finance-import-wizard";
import { requireChurchSession } from "@/lib/auth";
import { getFinanceAccounts, getFinanceImports } from "@/lib/finance-data";

export default async function FinanceImportPage() {
  const session = await requireChurchSession("/app/church-admin");
  if (session.appContext.roleId !== "church-admin") redirect(session.homePath);

  const [accounts, imports] = await Promise.all([
    getFinanceAccounts(session),
    getFinanceImports(session),
  ]);

  return <FinanceImportWizard session={session} accounts={accounts} recentImports={imports} />;
}
