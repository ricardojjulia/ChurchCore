import { redirect } from "next/navigation";

import { ChurchAdminGroupsImportWorkspace } from "@/components/application/church-admin-groups-import-workspace";
import { requireChurchSession } from "@/lib/auth";

export default async function ChurchAdminGroupsImportPage() {
  const session = await requireChurchSession("/app/church-admin/groups/import");

  if (session.appContext.roleId !== "church-admin") {
    redirect("/app/church-admin/groups");
  }

  return <ChurchAdminGroupsImportWorkspace session={session} />;
}
