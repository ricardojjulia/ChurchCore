import { redirect } from "next/navigation";

import { FinanceDashboard } from "@/components/application/finance-dashboard";
import { requireChurchSession } from "@/lib/auth";
import { getFinanceDashboardData } from "@/lib/finance-data";

export default async function FinanceDashboardPage() {
  const session = await requireChurchSession("/app/church-admin");
  if (session.appContext.roleId !== "church-admin") redirect(session.homePath);

  const data = await getFinanceDashboardData(session);
  return <FinanceDashboard session={session} data={data} />;
}
