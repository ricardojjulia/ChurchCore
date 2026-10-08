import { redirect } from "next/navigation";

import { ChurchAdminGroupsImportWorkspace } from "@/components/application/church-admin-groups-import-workspace";
import { requireChurchSession } from "@/lib/auth";
import { listRecentImportBatches } from "@/lib/import-reconciliation";

// A 5,000-row commit can run past the default function time; this applies to this
// page's server actions (dry run and commit).
export const maxDuration = 300;

export default async function ChurchAdminGroupsImportPage() {
  const session = await requireChurchSession("/app/church-admin/groups/import");

  if (session.appContext.roleId !== "church-admin") {
    redirect("/app/church-admin/groups");
  }

  let recentImports: Awaited<ReturnType<typeof listRecentImportBatches>> = [];
  let recentImportsFailed = false;
  try {
    recentImports = await listRecentImportBatches(session.appContext.church.id, ["groups_csv", "group_memberships_csv"], 20);
  } catch {
    recentImportsFailed = true;
    console.error("groups import page: recent imports could not be loaded");
  }

  return <ChurchAdminGroupsImportWorkspace session={session} recentImports={recentImports} recentImportsFailed={recentImportsFailed} />;
}
