import { redirect } from "next/navigation";

import { CustomReportsWorkspace } from "@/components/application/custom-reports-workspace";
import { ReportsShell } from "@/components/application/reports-shell";
import { requireChurchSession } from "@/lib/auth";

export default async function CustomReportsPage() {
  const session = await requireChurchSession("/app/reports/custom");
  const role = session.appContext.roleId;

  if (role !== "pastor" && role !== "church-admin") {
    redirect(session.homePath);
  }

  return (
    <ReportsShell
      session={session}
      title="Custom Query Reports"
      description={`${session.appContext.church.name} · dynamic spreadsheet exports`}
      activePath="/app/reports/custom"
      range="90d"
      hideRangeSelector={true}
    >
      <CustomReportsWorkspace session={session} />
    </ReportsShell>
  );
}
