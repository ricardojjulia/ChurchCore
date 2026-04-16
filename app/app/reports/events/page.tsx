import { redirect } from "next/navigation";

import { EventsReportsDashboard } from "@/components/application/reports-dashboards";
import { ReportsShell } from "@/components/application/reports-shell";
import { requireChurchSession } from "@/lib/auth";
import { getEventReportsData, normalizeReportTimeRange } from "@/lib/reports-data";

export default async function EventReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const session = await requireChurchSession("/app/reports/events");
  const role = session.appContext.roleId;

  if (role !== "pastor" && role !== "church-admin") {
    redirect(session.homePath);
  }

  const { range: rawRange } = await searchParams;
  const range = normalizeReportTimeRange(rawRange);
  const data = await getEventReportsData(session, range);

  return (
    <ReportsShell
      session={session}
      title="Event Reports"
      description={`${session.appContext.church.name} · turnout, visitor yield, and staffing pressure`}
      activePath="/app/reports/events"
      range={range}
    >
      <EventsReportsDashboard data={data} />
    </ReportsShell>
  );
}
