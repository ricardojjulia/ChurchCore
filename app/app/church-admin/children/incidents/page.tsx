import { redirect } from "next/navigation";

import { CcmIncidentList } from "@/components/application/ccm-incident-form";
import { requireChurchSession } from "@/lib/auth";
import { getCcmIncidents } from "@/lib/ccm-data";

export default async function CcmIncidentsPage() {
  const session = await requireChurchSession("/app/church-admin/children/incidents");
  if (session.appContext.roleId !== "church-admin") redirect(session.homePath);

  const incidents = await getCcmIncidents(session);
  return <CcmIncidentList session={session} incidents={incidents} />;
}
