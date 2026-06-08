import { redirect } from "next/navigation";

import { requireChurchSession } from "@/lib/auth";
import { listChurchDocumentsAction } from "@/app/app/church-admin/operations/actions";
import { OperationsDocumentsWorkspace } from "@/components/application/operations-documents-workspace";

export default async function OperationsDocumentsPage() {
  const session = await requireChurchSession("/app/church-admin/operations/documents");

  if (
    session.appContext.roleId !== "church-admin" &&
    session.appContext.roleId !== "pastor"
  ) {
    redirect(session.homePath);
  }

  const result = await listChurchDocumentsAction();

  return (
    <OperationsDocumentsWorkspace
      session={session}
      documents={result.ok ? (result.documents ?? []) : []}
      loadError={result.ok ? undefined : result.error}
    />
  );
}
