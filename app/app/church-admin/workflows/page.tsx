import { redirect } from "next/navigation";

import { ShepherdWorkflowQueue } from "@/components/application/shepherd-workflow-queue";
import { requireChurchSession } from "@/lib/auth";
import { getShepherdAiWorkflowQueueData } from "@/lib/shepherd-ai/ops-data";

export default async function ShepherdWorkflowQueuePage() {
  const session = await requireChurchSession("/app/church-admin/workflows");

  if (
    session.appContext.roleId !== "church-admin" &&
    session.appContext.roleId !== "pastor"
  ) {
    redirect(session.homePath);
  }

  const data = await getShepherdAiWorkflowQueueData(session);

  return <ShepherdWorkflowQueue session={session} {...data} />;
}
