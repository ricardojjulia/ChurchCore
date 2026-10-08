import { redirect } from "next/navigation";

import { ChurchAdminPeopleImportWorkspace } from "@/components/application/church-admin-people-import-workspace";
import { requireChurchSession } from "@/lib/auth";

// A 5,000-row commit can run past the default function time; this applies to this
// page's server actions (dry run and commit).
export const maxDuration = 300;

export default async function ChurchAdminPeopleImportPage() {
  const session = await requireChurchSession("/app/church-admin/people/import");

  if (session.appContext.roleId !== "church-admin") {
    redirect(session.homePath);
  }

  return <ChurchAdminPeopleImportWorkspace session={session} />;
}
