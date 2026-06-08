import { redirect } from "next/navigation";

import { requireChurchSession } from "@/lib/auth";
import { OperationsDocumentFormClient } from "@/components/application/operations-document-form-client";

export default async function OperationsDocumentNewPage() {
  const session = await requireChurchSession("/app/church-admin/operations/documents/new");

  if (
    session.appContext.roleId !== "church-admin" &&
    session.appContext.roleId !== "pastor"
  ) {
    redirect(session.homePath);
  }

  return <OperationsDocumentFormClient session={session} />;
}
