import { redirect } from "next/navigation";

import { GivingReportsDashboard } from "@/components/application/reports-dashboards";
import { ReportsShell } from "@/components/application/reports-shell";
import { requireChurchSession } from "@/lib/auth";
import { getGivingReportsData, normalizeReportTimeRange } from "@/lib/reports-data";

export default async function GivingReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const session = await requireChurchSession("/app/reports/giving");
  const role = session.appContext.roleId;

  if (role !== "pastor" && role !== "church-admin") {
    redirect(session.homePath);
  }

  const { range: rawRange } = await searchParams;
  const range = normalizeReportTimeRange(rawRange);
  const data = await getGivingReportsData(session, range);

  return (
    <ReportsShell
      session={session}
      title="Giving Reports"
      description={`${session.appContext.church.name} · fund health, generosity rhythm, and donor journey`}
      activePath="/app/reports/giving"
      range={range}
    >
      <GivingReportsDashboard data={data} />
    </ReportsShell>
  );
}
