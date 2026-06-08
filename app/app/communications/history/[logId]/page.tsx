import { notFound, redirect } from "next/navigation";

import {
  getMessageAnalyticsAction,
  listCommunicationLogsAction,
} from "@/app/app/communications-actions";
import { CommunicationsMessageDetailClient } from "@/components/application/communications-message-detail-client";
import { requireChurchSession } from "@/lib/auth";

export default async function CommunicationsMessageDetailPage({
  params,
}: {
  params: Promise<{ logId: string }>;
}) {
  const session = await requireChurchSession("/app/communications");

  const role = session.appContext.roleId;
  if (role !== "pastor" && role !== "church-admin" && role !== "secretary") {
    redirect(session.homePath);
  }

  const { logId } = await params;

  const logsResult = await listCommunicationLogsAction();
  if (!logsResult.ok) {
    notFound();
  }

  const log = logsResult.logs.find((l) => l.id === logId);
  if (!log) {
    notFound();
  }

  const analyticsResult = await getMessageAnalyticsAction(logId);
  const analytics = analyticsResult.ok
    ? analyticsResult.analytics
    : {
        logId,
        sentCount: 0,
        deliveredCount: 0,
        bouncedCount: 0,
        failedCount: 0,
        openRate: null,
        suppressedCount: 0,
      };

  return (
    <CommunicationsMessageDetailClient session={session} log={log} analytics={analytics} />
  );
}
