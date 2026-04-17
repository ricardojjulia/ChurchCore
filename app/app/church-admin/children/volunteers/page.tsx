import { redirect } from "next/navigation";

import { CcmVolunteerPanel } from "@/components/application/ccm-volunteer-panel";
import { requireChurchSession } from "@/lib/auth";
import { getCcmServiceList } from "@/lib/ccm-data";

export default async function CcmVolunteersPage() {
  const session = await requireChurchSession("/app/church-admin/children/volunteers");
  if (session.appContext.roleId !== "church-admin") redirect(session.homePath);

  const services = await getCcmServiceList(session);
  const activeService = services.find((s) => s.status === "open") ?? services[0] ?? null;

  return <CcmVolunteerPanel session={session} services={services} activeService={activeService} />;
}
