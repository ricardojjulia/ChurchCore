import { notFound, redirect } from "next/navigation";

import { CcmServiceDetail } from "@/components/application/ccm-service-manager";
import { requireChurchSession } from "@/lib/auth";
import { getCcmIncidents, getCcmRoster } from "@/lib/ccm-data";

export default async function CcmServiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireChurchSession("/app/church-admin/children/services");
  if (session.appContext.roleId !== "church-admin") redirect(session.homePath);

  const [roster, incidents] = await Promise.all([
    getCcmRoster(session, id),
    getCcmIncidents(session, { serviceId: id }),
  ]);
  if (!roster) notFound();

  return <CcmServiceDetail session={session} roster={roster} incidents={incidents} />;
}
