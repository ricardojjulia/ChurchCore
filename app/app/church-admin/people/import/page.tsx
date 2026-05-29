import { redirect } from "next/navigation";

import { ChurchAdminPeopleImportWorkspace } from "@/components/application/church-admin-people-import-workspace";
import { requireChurchSession } from "@/lib/auth";

export default async function ChurchAdminPeopleImportPage() {
  const session = await requireChurchSession("/app/church-admin/people/import");

  if (session.appContext.roleId !== "church-admin") {
    redirect(session.homePath);
  }

  return <ChurchAdminPeopleImportWorkspace session={session} />;
}
