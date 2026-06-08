import { redirect, notFound } from "next/navigation";

import { requireChurchSession } from "@/lib/auth";
import { getChurchDocumentAction } from "@/app/app/church-admin/operations/actions";
import { OperationsDocumentDetailClient } from "@/components/application/operations-document-detail-client";

export default async function OperationsDocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireChurchSession(`/app/church-admin/operations/documents/${id}`);

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

  return <OperationsDocumentDetailClient session={session} document={result.document} />;
}
