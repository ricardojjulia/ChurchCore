import type { Metadata } from "next";

import { ControlPlaneDashboard } from "@/components/application/control-plane-dashboard";
import { requireControlPlaneSession } from "@/lib/auth";
import { getControlPlaneDashboardData } from "@/lib/control-plane-data";

export const metadata: Metadata = {
  title: "Control Plane | ChurchForge",
  description:
    "Platform-side tenant, billing, and support operations for ChurchForge staff.",
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
