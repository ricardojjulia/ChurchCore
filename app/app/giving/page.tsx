import { redirect } from "next/navigation";

import { GivingDashboard } from "@/components/application/giving-dashboard";
import { requireChurchSession } from "@/lib/auth";
import { getGivingDashboardData } from "@/lib/donations-data";

export default async function GivingDashboardPage() {
  const session = await requireChurchSession("/app/pastor");

  // Role guard — pastor and church-admin only
  const role = session.appContext.roleId;
  if (role !== "pastor" && role !== "church-admin") {
    redirect(session.homePath);
  }

  const data = await getGivingDashboardData(session);

  return <GivingDashboard session={session} data={data} />;
}
