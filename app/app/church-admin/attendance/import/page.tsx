import { redirect } from "next/navigation";

import { ChurchAdminAttendanceImportWorkspace } from "@/components/application/church-admin-attendance-import-workspace";
import { requireChurchSession } from "@/lib/auth";

// A 5,000-row commit can run past the default function time; this applies to this
// page's server actions (dry run and commit).
export const maxDuration = 300;

export default async function ChurchAdminAttendanceImportPage() {
  const session = await requireChurchSession("/app/church-admin/attendance/import");

  if (session.appContext.roleId !== "church-admin") {
    redirect("/app/church-admin/attendance");
  }

  return <ChurchAdminAttendanceImportWorkspace session={session} />;
}
