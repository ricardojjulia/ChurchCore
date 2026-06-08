import { redirect, notFound } from "next/navigation";

import { requireChurchSession } from "@/lib/auth";
import { getChurchDocumentAction } from "@/app/app/church-admin/operations/actions";
import { OperationsDocumentFormClient } from "@/components/application/operations-document-form-client";

export default async function OperationsDocumentEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireChurchSession(`/app/church-admin/operations/documents/${id}/edit`);

  if (
    session.appContext.roleId !== "church-admin" &&
    session.appContext.roleId !== "pastor"
  ) {
    redirect(session.homePath);
  }

  const result = await getChurchDocumentAction({ id });

  if (!result.ok || !result.document) {
    notFound();
  }

  return (
    <OperationsDocumentFormClient
      session={session}
      initialValues={result.document}
      isEdit
    />
  );
}
