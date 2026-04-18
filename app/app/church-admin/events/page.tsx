import { redirect } from "next/navigation";

import { EventsListWorkspace } from "@/components/application/church-admin-event-workspace";
import { requireChurchSession } from "@/lib/auth";
import { getChurchAdminEventsList } from "@/lib/church-admin-events-data";

export default async function EventsListPage() {
  const session = await requireChurchSession("/app/church-admin/events");
  const role = session.appContext.roleId;
  if (role !== "church-admin" && role !== "pastor") redirect(session.homePath);

  const events = await getChurchAdminEventsList(session);
  return <EventsListWorkspace session={session} events={events} />;
}
