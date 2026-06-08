import { redirect, notFound } from "next/navigation";

import { requireChurchSession } from "@/lib/auth";
import { getOnboardingTemplateAction } from "@/app/app/church-admin/operations/actions";
import { OperationsOnboardingTemplateDetailClient } from "@/components/application/operations-onboarding-template-detail-client";

export default async function OperationsOnboardingTemplateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireChurchSession(
    `/app/church-admin/operations/onboarding/templates/${id}`,
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
    <OperationsOnboardingTemplateDetailClient
      session={session}
      template={result.template}
      steps={result.steps ?? []}
    />
  );
}
