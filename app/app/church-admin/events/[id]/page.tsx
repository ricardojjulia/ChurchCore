import { notFound, redirect } from "next/navigation";

import { ChurchAdminEventWorkspace } from "@/components/application/church-admin-event-workspace";
import { requireChurchSession } from "@/lib/auth";
import { getChurchAdminEventWorkspaceData } from "@/lib/church-admin-events-data";

export default async function ChurchAdminEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireChurchSession(`/app/church-admin/events/${id}`);

  if (
    session.appContext.roleId !== "church-admin" &&
    session.appContext.roleId !== "pastor"
  ) {
    redirect(session.homePath);
  }

  const data = await getChurchAdminEventWorkspaceData(session, id);

  if (!data) {
    notFound();
  }

  return <ChurchAdminEventWorkspace session={session} data={data} />;
}
