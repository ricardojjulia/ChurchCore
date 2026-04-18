import { redirect } from "next/navigation";

import { AttendanceDashboard } from "@/components/application/attendance-dashboard";
import { requireChurchSession } from "@/lib/auth";
import { getServiceAttendanceList } from "@/lib/groups-data";

export default async function AttendancePage() {
  const session = await requireChurchSession("/app/church-admin");
  const role = session.appContext.roleId;
  if (role !== "church-admin" && role !== "pastor") redirect(session.homePath);

  const records = await getServiceAttendanceList(session);
  return <AttendanceDashboard session={session} records={records} />;
}
