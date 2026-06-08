import { redirect } from "next/navigation";

import { requireChurchSession } from "@/lib/auth";
import { OperationsOnboardingTemplateFormClient } from "@/components/application/operations-onboarding-template-form-client";

export default async function OperationsOnboardingTemplateNewPage() {
  const session = await requireChurchSession(
    "/app/church-admin/operations/onboarding/templates/new",
  );

  if (
    session.appContext.roleId !== "church-admin" &&
    session.appContext.roleId !== "pastor"
  ) {
    redirect(session.homePath);
  }

  return <OperationsOnboardingTemplateFormClient session={session} />;
}
