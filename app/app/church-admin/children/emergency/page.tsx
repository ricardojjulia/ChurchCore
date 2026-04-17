import { redirect } from "next/navigation";

import { CcmEmergencyRoster } from "@/components/application/ccm-roster";
import { requireChurchSession } from "@/lib/auth";
import { getCcmServiceList, getEmergencyRoster } from "@/lib/ccm-data";

export default async function CcmEmergencyPage() {
  const session = await requireChurchSession("/app/church-admin/children/emergency");
  if (session.appContext.roleId !== "church-admin") redirect(session.homePath);

  const services = await getCcmServiceList(session);
  const activeService = services.find((s) => s.status === "open") ?? services[0] ?? null;

  const roster = activeService
    ? await getEmergencyRoster(session, activeService.id)
    : null;

  return <CcmEmergencyRoster roster={roster} />;
}
