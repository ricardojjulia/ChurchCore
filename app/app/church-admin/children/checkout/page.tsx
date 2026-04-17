import { redirect } from "next/navigation";

import { CcmCheckoutKiosk } from "@/components/application/ccm-checkout-kiosk";
import { requireChurchSession } from "@/lib/auth";
import { getCcmDashboard, getCcmServiceList } from "@/lib/ccm-data";

export default async function CcmCheckoutPage() {
  const session = await requireChurchSession("/app/church-admin/children/checkout");
  if (session.appContext.roleId !== "church-admin") redirect(session.homePath);

  const services = await getCcmServiceList(session);
  const activeService = services.find((s) => s.status === "open") ?? null;

  const dashboard = activeService
    ? await getCcmDashboard(session, activeService.id)
    : null;

  return (
    <CcmCheckoutKiosk
      session={session}
      activeService={activeService}
      activeSessions={dashboard?.roomStatuses.flatMap((r) => r.activeSessions) ?? []}
    />
  );
}
