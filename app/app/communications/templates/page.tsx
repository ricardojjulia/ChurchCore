import { redirect } from "next/navigation";

import { listTemplatesAction } from "@/app/app/communications-actions";
import { CommunicationsTemplatesWorkspace } from "@/components/application/communications-templates-workspace";
import { requireChurchSession } from "@/lib/auth";

export default async function CommunicationsTemplatesPage() {
  const session = await requireChurchSession("/app/communications");

  const role = session.appContext.roleId;
  if (role !== "pastor" && role !== "church-admin" && role !== "secretary") {
    redirect(session.homePath);
  }

  const result = await listTemplatesAction();
  const templates = result.ok ? result.templates : [];

  return <CommunicationsTemplatesWorkspace session={session} templates={templates} />;
}
