import { redirect } from "next/navigation";

import { FinanceAccountsWorkspace } from "@/components/application/finance-accounts-workspace";
import { requireChurchSession } from "@/lib/auth";
import { getFinanceAccounts } from "@/lib/finance-data";

export default async function FinanceAccountsPage() {
  const session = await requireChurchSession("/app/church-admin");
  if (session.appContext.roleId !== "church-admin") redirect(session.homePath);

  const accounts = await getFinanceAccounts(session);
  return <FinanceAccountsWorkspace session={session} accounts={accounts} />;
}
