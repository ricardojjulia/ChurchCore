import { redirect } from "next/navigation";

import { CommunicationsTemplateFormClient } from "@/components/application/communications-template-form-client";
import { requireChurchSession } from "@/lib/auth";

export default async function CommunicationsTemplatesNewPage() {
  const session = await requireChurchSession("/app/communications");

  const role = session.appContext.roleId;
  if (role !== "pastor" && role !== "church-admin" && role !== "secretary") {
    redirect(session.homePath);
  }

  return <CommunicationsTemplateFormClient session={session} />;
}
