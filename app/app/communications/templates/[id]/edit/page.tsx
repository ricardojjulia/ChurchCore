import { notFound, redirect } from "next/navigation";

import { listTemplatesAction } from "@/app/app/communications-actions";
import { CommunicationsTemplateFormClient } from "@/components/application/communications-template-form-client";
import { requireChurchSession } from "@/lib/auth";

export default async function CommunicationsTemplateEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireChurchSession("/app/communications");

  const role = session.appContext.roleId;
  if (role !== "pastor" && role !== "church-admin" && role !== "secretary") {
    redirect(session.homePath);
  }

  const { id } = await params;

  const result = await listTemplatesAction();
  if (!result.ok) {
    notFound();
  }

  const template = result.templates.find((t) => t.id === id);
  if (!template) {
    notFound();
  }

  return (
    <CommunicationsTemplateFormClient
      session={session}
      initialValues={template}
      isEdit
    />
  );
}
