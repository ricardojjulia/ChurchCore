import { notFound, redirect } from "next/navigation";

import {
  ChurchAdminEventDetailWorkspace,
} from "@/components/application/church-admin-event-workspace";
import { requireChurchSession } from "@/lib/auth";
import {
  getChurchAdminEventWorkspaceData,
  getEventRegistrations,
} from "@/lib/church-admin-events-data";

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

  const [data, { registrations, settings, formFields }] = await Promise.all([
    getChurchAdminEventWorkspaceData(session, id),
    getEventRegistrations(session, id),
  ]);

  if (!data) {
    notFound();
  }

  return (
    <ChurchAdminEventDetailWorkspace
      session={session}
      eventId={id}
      data={data}
      registrations={registrations}
      settings={settings}
      formFields={formFields}
    />
  );
}
