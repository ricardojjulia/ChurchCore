import { redirect } from "next/navigation";

import { ChurchAdminGivingImportWorkspace } from "@/components/application/church-admin-giving-import-workspace";
import { requireChurchSession } from "@/lib/auth";

// A 5,000-row commit can run past the default function time; this applies to this
// page's server actions (dry run and commit).
export const maxDuration = 300;

export default async function ChurchAdminGivingImportPage() {
  const session = await requireChurchSession("/app/church-admin/giving/import");

  if (session.appContext.roleId !== "church-admin") {
    redirect("/app/church-admin/giving");
  }

  return <ChurchAdminGivingImportWorkspace session={session} />;
}
