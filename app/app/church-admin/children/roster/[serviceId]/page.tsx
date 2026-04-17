import { notFound, redirect } from "next/navigation";

import { CcmRosterView } from "@/components/application/ccm-roster";
import { requireChurchSession } from "@/lib/auth";
import { getCcmRoster } from "@/lib/ccm-data";

export default async function CcmRosterPage({
  params,
}: {
  params: Promise<{ serviceId: string }>;
}) {
  const { serviceId } = await params;
  const session = await requireChurchSession("/app/church-admin/children/services");
  if (session.appContext.roleId !== "church-admin") redirect(session.homePath);

  const roster = await getCcmRoster(session, serviceId);
  if (!roster) notFound();

  return <CcmRosterView session={session} roster={roster} />;
}
