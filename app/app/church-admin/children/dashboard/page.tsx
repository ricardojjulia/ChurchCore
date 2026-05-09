import { redirect } from "next/navigation";

import { CcmDashboardView } from "@/components/application/ccm-dashboard";
import { requireChurchSession } from "@/lib/auth";
import { getCcmDashboard, getCcmServiceList } from "@/lib/ccm-data";

export default async function CcmDashboardPage({
  searchParams = Promise.resolve({}),
}: {
  searchParams?: Promise<{ view?: string }>;
} = {}) {
  const session = await requireChurchSession("/app/church-admin/children/dashboard");
  if (session.appContext.roleId !== "church-admin") redirect(session.homePath);
  const { view } = await searchParams;

  const services = await getCcmServiceList(session);
  const activeService = services.find((s) => s.status === "open") ?? services[0] ?? null;

  const dashboard = activeService
    ? await getCcmDashboard(session, activeService.id)
    : null;

  return (
    <CcmDashboardView
      session={session}
      dashboard={dashboard}
      services={services}
      activeServiceId={activeService?.id ?? null}
      readinessView={view === "readiness"}
    />
  );
}
