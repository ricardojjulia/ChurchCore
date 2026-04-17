import { redirect } from "next/navigation";

import { FinanceAccountsWorkspace } from "@/components/application/finance-accounts-workspace";
import { requireChurchSession } from "@/lib/auth";
import { getFinanceAccounts } from "@/lib/finance-data";

export default async function FinanceAccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireChurchSession("/app/church-admin");
  if (session.appContext.roleId !== "church-admin") redirect(session.homePath);

  const { id } = await params;
  const accounts = await getFinanceAccounts(session);
  const account = accounts.find((a) => a.id === id) ?? null;

  return <FinanceAccountsWorkspace session={session} accounts={accounts} selectedAccountId={account?.id ?? null} />;
}
