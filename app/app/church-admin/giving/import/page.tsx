import { redirect } from "next/navigation";

import { ChurchAdminGivingImportWorkspace } from "@/components/application/church-admin-giving-import-workspace";
import { requireChurchSession } from "@/lib/auth";
import { listRecentImportBatches } from "@/lib/import-reconciliation";

// A 5,000-row commit can run past the default function time; this applies to this
// page's server actions (dry run and commit).
export const maxDuration = 300;

export default async function ChurchAdminGivingImportPage() {
  const session = await requireChurchSession("/app/church-admin/giving/import");

  if (session.appContext.roleId !== "church-admin") {
    redirect("/app/church-admin/giving");
  }

  let recentImports: Awaited<ReturnType<typeof listRecentImportBatches>> = [];
  let recentImportsFailed = false;
  try {
    recentImports = await listRecentImportBatches(session.appContext.church.id, ["giving_csv"], 20);
  } catch {
    recentImportsFailed = true;
    console.error("giving import page: recent imports could not be loaded");
  }

  return <ChurchAdminGivingImportWorkspace session={session} recentImports={recentImports} recentImportsFailed={recentImportsFailed} />;
}
