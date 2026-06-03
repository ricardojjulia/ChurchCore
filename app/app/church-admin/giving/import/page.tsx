import { redirect } from "next/navigation";

import { ChurchAdminGivingImportWorkspace } from "@/components/application/church-admin-giving-import-workspace";
import { requireChurchSession } from "@/lib/auth";

export default async function ChurchAdminGivingImportPage() {
  const session = await requireChurchSession("/app/church-admin/giving/import");

  if (session.appContext.roleId !== "church-admin") {
    redirect("/app/church-admin/giving");
  }

  return <ChurchAdminGivingImportWorkspace session={session} />;
}
