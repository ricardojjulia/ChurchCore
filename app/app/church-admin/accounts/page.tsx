import { redirect } from "next/navigation";

import { ChurchAdminAccountsWorkspace } from "@/components/application/church-admin-accounts-workspace";
import { requireChurchSession } from "@/lib/auth";
import { getChurchAdminAccountsData } from "@/lib/church-admin-accounts-data";

export default async function ChurchAdminAccountsPage() {
  const session = await requireChurchSession("/app/church-admin/accounts");

  if (session.appContext.roleId !== "church-admin") {
    redirect(session.homePath);
  }

  const data = await getChurchAdminAccountsData(session);

  return <ChurchAdminAccountsWorkspace session={session} data={data} />;
}
