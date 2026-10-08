import { redirect } from "next/navigation";

import { ChurchAdminGroupsImportWorkspace } from "@/components/application/church-admin-groups-import-workspace";
import { requireChurchSession } from "@/lib/auth";

// A 5,000-row commit can run past the default function time; this applies to this
// page's server actions (dry run and commit).
export const maxDuration = 300;

export default async function ChurchAdminGroupsImportPage() {
  const session = await requireChurchSession("/app/church-admin/groups/import");

  if (session.appContext.roleId !== "church-admin") {
    redirect("/app/church-admin/groups");
  }

  return <ChurchAdminGroupsImportWorkspace session={session} />;
}
