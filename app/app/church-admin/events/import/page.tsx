import { redirect } from "next/navigation";

import { ChurchAdminEventsImportWorkspace } from "@/components/application/church-admin-events-import-workspace";
import { requireChurchSession } from "@/lib/auth";
import { listRecentImportBatches } from "@/lib/import-reconciliation";

// A 5,000-row commit can run past the default function time; this applies to this
// page's server actions (dry run and commit).
export const maxDuration = 300;

export default async function ChurchAdminEventsImportPage() {
  const session = await requireChurchSession("/app/church-admin/events/import");

  if (session.appContext.roleId !== "church-admin") {
    redirect("/app/church-admin/events");
  }

  const recentImports = await listRecentImportBatches(session.appContext.church.id, ["events_csv"], 20);

  return <ChurchAdminEventsImportWorkspace session={session} recentImports={recentImports} />;
}
