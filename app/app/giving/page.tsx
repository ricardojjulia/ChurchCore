import { redirect } from "next/navigation";

import { GivingDashboard } from "@/components/application/giving-dashboard";
import { requireChurchSession } from "@/lib/auth";
import { getGivingAnalyticsData, getGivingDashboardData } from "@/lib/donations-data";

export default async function GivingDashboardPage() {
  const session = await requireChurchSession("/app/pastor");

  const role = session.appContext.roleId;
  if (role !== "pastor" && role !== "church-admin") {
    redirect(session.homePath);
  }

  const [data, analytics] = await Promise.all([
    getGivingDashboardData(session),
    getGivingAnalyticsData(session),
  ]);

  return <GivingDashboard session={session} data={data} analytics={analytics} />;
}
