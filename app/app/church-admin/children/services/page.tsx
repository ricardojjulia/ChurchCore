import { redirect } from "next/navigation";

import { CcmServiceList } from "@/components/application/ccm-service-manager";
import { requireChurchSession } from "@/lib/auth";
import { getCcmServiceList } from "@/lib/ccm-data";

export default async function CcmServicesPage() {
  const session = await requireChurchSession("/app/church-admin/children/services");
  if (session.appContext.roleId !== "church-admin") redirect(session.homePath);

  const services = await getCcmServiceList(session);
  return <CcmServiceList session={session} services={services} />;
}
