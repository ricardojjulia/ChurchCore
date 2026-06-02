import { redirect } from "next/navigation";

import { ChurchAdminEventsImportWorkspace } from "@/components/application/church-admin-events-import-workspace";
import { requireChurchSession } from "@/lib/auth";

export default async function ChurchAdminEventsImportPage() {
  const session = await requireChurchSession("/app/church-admin/events/import");

  if (session.appContext.roleId !== "church-admin") {
    redirect("/app/church-admin/events");
  }

  return <ChurchAdminEventsImportWorkspace session={session} />;
}
