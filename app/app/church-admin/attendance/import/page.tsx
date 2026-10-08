import { redirect } from "next/navigation";

import { ChurchAdminAttendanceImportWorkspace } from "@/components/application/church-admin-attendance-import-workspace";
import { requireChurchSession } from "@/lib/auth";
import { listRecentImportBatches } from "@/lib/import-reconciliation";

// A 5,000-row commit can run past the default function time; this applies to this
// page's server actions (dry run and commit).
export const maxDuration = 300;

export default async function ChurchAdminAttendanceImportPage() {
  const session = await requireChurchSession("/app/church-admin/attendance/import");

  if (session.appContext.roleId !== "church-admin") {
    redirect("/app/church-admin/attendance");
  }

  const recentImports = await listRecentImportBatches(session.appContext.church.id, ["attendance_csv"], 20);

  return <ChurchAdminAttendanceImportWorkspace session={session} recentImports={recentImports} />;
}
