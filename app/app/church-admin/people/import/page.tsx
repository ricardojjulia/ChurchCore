import { redirect } from "next/navigation";

import { ChurchAdminPeopleImportWorkspace } from "@/components/application/church-admin-people-import-workspace";
import { requireChurchSession } from "@/lib/auth";
import { listRecentImportBatches } from "@/lib/import-reconciliation";

// A 5,000-row commit can run past the default function time; this applies to this
// page's server actions (dry run and commit).
export const maxDuration = 300;

export default async function ChurchAdminPeopleImportPage() {
  const session = await requireChurchSession("/app/church-admin/people/import");

  if (session.appContext.roleId !== "church-admin") {
    redirect(session.homePath);
  }

  let recentImports: Awaited<ReturnType<typeof listRecentImportBatches>> = [];
  let recentImportsFailed = false;
  try {
    recentImports = await listRecentImportBatches(session.appContext.church.id, ["people_households_csv"], 20);
  } catch {
    recentImportsFailed = true;
    console.error("people import page: recent imports could not be loaded");
  }

  return <ChurchAdminPeopleImportWorkspace session={session} recentImports={recentImports} recentImportsFailed={recentImportsFailed} />;
}
