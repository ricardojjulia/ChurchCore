import { redirect } from "next/navigation";

import { CommunicationsSuppressionsWorkspace } from "@/components/application/communications-suppressions-workspace";
import { requireChurchSession } from "@/lib/auth";
import { listChurchSuppressions } from "@/lib/communications/suppressions";

export default async function CommunicationsSuppressionsPage() {
  const session = await requireChurchSession("/app/communications");

  const role = session.appContext.roleId;
  if (role !== "pastor" && role !== "church-admin" && role !== "secretary") {
    redirect(session.homePath);
  }

  const suppressions = await listChurchSuppressions(session);

  return (
    <CommunicationsSuppressionsWorkspace
      session={session}
      suppressions={suppressions}
      canManage={role === "church-admin"}
    />
  );
}
