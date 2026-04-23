import type { Metadata } from "next";

import { ControlPlaneDashboard } from "@/components/application/control-plane-dashboard";
import { requireControlPlaneSession } from "@/lib/auth";
import { getControlPlaneDashboardData } from "@/lib/control-plane-data";

export const metadata: Metadata = {
  title: "Control Plane | ChurchCore Ops",
  description:
    "Platform-side tenant, billing, and support operations for ChurchCore Ops staff.",
};

export default async function ControlPlanePage() {
  const session = await requireControlPlaneSession("/control");
  const dashboardData = await getControlPlaneDashboardData(session);

  return (
    <ControlPlaneDashboard
      session={session}
      sectionId="overview"
      dashboardData={dashboardData}
    />
  );
}
