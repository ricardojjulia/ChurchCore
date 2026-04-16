import { redirect } from "next/navigation";

import { ReportsOverviewDashboard } from "@/components/application/reports-dashboards";
import { ReportsShell } from "@/components/application/reports-shell";
import { requireChurchSession } from "@/lib/auth";
import {
  getEventReportsData,
  getGivingReportsData,
  getMemberReportsData,
  normalizeReportTimeRange,
} from "@/lib/reports-data";

export default async function ReportsOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const session = await requireChurchSession("/app/reports");
  const role = session.appContext.roleId;

  if (role !== "pastor" && role !== "church-admin") {
    redirect(session.homePath);
  }

  const { range: rawRange } = await searchParams;
  const range = normalizeReportTimeRange(rawRange);

  const [members, events, giving] = await Promise.all([
    getMemberReportsData(session, range),
    getEventReportsData(session, range),
    getGivingReportsData(session, range),
  ]);

  return (
    <ReportsShell
      session={session}
      title="Reports"
      description={`${session.appContext.church.name} · graphical stewardship reporting`}
      activePath="/app/reports"
      range={range}
    >
      <ReportsOverviewDashboard members={members} events={events} giving={giving} />
    </ReportsShell>
  );
}
