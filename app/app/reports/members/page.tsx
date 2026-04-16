import { redirect } from "next/navigation";

import { MembersReportsDashboard } from "@/components/application/reports-dashboards";
import { ReportsShell } from "@/components/application/reports-shell";
import { requireChurchSession } from "@/lib/auth";
import { getMemberReportsData, normalizeReportTimeRange } from "@/lib/reports-data";

export default async function MemberReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const session = await requireChurchSession("/app/reports/members");
  const role = session.appContext.roleId;

  if (role !== "pastor" && role !== "church-admin") {
    redirect(session.homePath);
  }

  const { range: rawRange } = await searchParams;
  const range = normalizeReportTimeRange(rawRange);
  const data = await getMemberReportsData(session, range);

  return (
    <ReportsShell
      session={session}
      title="Member Reports"
      description={`${session.appContext.church.name} · attendance, drift, and engagement reporting`}
      activePath="/app/reports/members"
      range={range}
    >
      <MembersReportsDashboard data={data} />
    </ReportsShell>
  );
}
