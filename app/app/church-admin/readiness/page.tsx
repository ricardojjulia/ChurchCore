import { redirect } from "next/navigation";

import { ChurchAdminReadinessWorkspace } from "@/components/application/church-admin-readiness-workspace";
import { requireChurchSession } from "@/lib/auth";
import { getChurchAdminReadinessData } from "@/lib/church-admin-readiness-data";

export default async function ChurchAdminReadinessPage() {
  const session = await requireChurchSession("/app/church-admin/readiness");

  if (session.appContext.roleId !== "church-admin") {
    redirect(session.homePath);
  }

  const data = await getChurchAdminReadinessData(session);

  return <ChurchAdminReadinessWorkspace session={session} data={data} />;
}
