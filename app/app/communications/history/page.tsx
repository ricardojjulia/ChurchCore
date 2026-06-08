import { redirect } from "next/navigation";

import { listCommunicationLogsAction } from "@/app/app/communications-actions";
import { CommunicationsHistoryWorkspace } from "@/components/application/communications-history-workspace";
import { requireChurchSession } from "@/lib/auth";

export default async function CommunicationsHistoryPage() {
  const session = await requireChurchSession("/app/communications");

  const role = session.appContext.roleId;
  if (role !== "pastor" && role !== "church-admin" && role !== "secretary") {
    redirect(session.homePath);
  }

  const result = await listCommunicationLogsAction();
  const logs = result.ok ? result.logs : [];

  return <CommunicationsHistoryWorkspace session={session} logs={logs} />;
}
