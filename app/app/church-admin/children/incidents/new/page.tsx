import { redirect } from "next/navigation";

import { CcmIncidentForm } from "@/components/application/ccm-incident-form";
import { requireChurchSession } from "@/lib/auth";
import { getCcmServiceList } from "@/lib/ccm-data";

export default async function CcmNewIncidentPage() {
  const session = await requireChurchSession("/app/church-admin/children/incidents");
  if (session.appContext.roleId !== "church-admin") redirect(session.homePath);

  const services = await getCcmServiceList(session);
  const activeService = services.find((s) => s.status === "open") ?? null;

  return <CcmIncidentForm session={session} activeService={activeService} />;
}
