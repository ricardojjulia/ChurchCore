import { redirect } from "next/navigation";

import { EventsListWorkspace } from "@/components/application/church-admin-event-workspace";
import { requireChurchSession } from "@/lib/auth";
import { getChurchAdminEventsList } from "@/lib/church-admin-events-data";
import { hasTenantBackendEnv } from "@/lib/supabase/tenant";

export default async function EventsListPage() {
  const session = await requireChurchSession("/app/church-admin/events");
  const role = session.appContext.roleId;
  if (role !== "church-admin") redirect(session.homePath);

  const events = await getChurchAdminEventsList(session);
  const source = hasTenantBackendEnv() && session.source === "supabase" ? "live" : "preview";
  return <EventsListWorkspace session={session} events={events} source={source} />;
}
