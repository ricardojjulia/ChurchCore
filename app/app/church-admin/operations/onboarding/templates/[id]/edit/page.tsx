import { redirect, notFound } from "next/navigation";

import { requireChurchSession } from "@/lib/auth";
import { getOnboardingTemplateAction } from "@/app/app/church-admin/operations/actions";
import { OperationsOnboardingTemplateFormClient } from "@/components/application/operations-onboarding-template-form-client";

export default async function OperationsOnboardingTemplateEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireChurchSession(
    `/app/church-admin/operations/onboarding/templates/${id}/edit`,
  );

  if (
    session.appContext.roleId !== "church-admin" &&
    session.appContext.roleId !== "pastor"
  ) {
    redirect(session.homePath);
  }

  const result = await getOnboardingTemplateAction({ id });

  if (!result.ok || !result.template) {
    notFound();
  }

  return (
    <OperationsOnboardingTemplateFormClient
      session={session}
      initialValues={{ template: result.template, steps: result.steps ?? [] }}
    />
  );
}
