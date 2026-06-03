import { redirect } from "next/navigation";

import { ChurchAdminAttendanceImportWorkspace } from "@/components/application/church-admin-attendance-import-workspace";
import { requireChurchSession } from "@/lib/auth";

export default async function ChurchAdminAttendanceImportPage() {
  const session = await requireChurchSession("/app/church-admin/attendance/import");

  if (session.appContext.roleId !== "church-admin") {
    redirect("/app/church-admin/attendance");
  }

  return <ChurchAdminAttendanceImportWorkspace session={session} />;
}
