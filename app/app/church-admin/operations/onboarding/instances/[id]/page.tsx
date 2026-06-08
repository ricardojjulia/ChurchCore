import { redirect, notFound } from "next/navigation";

import { requireChurchSession } from "@/lib/auth";
import { getOnboardingInstanceAction } from "@/app/app/church-admin/operations/actions";
import { OperationsInstanceDetailClient } from "@/components/application/operations-instance-detail-client";

export default async function OperationsOnboardingInstanceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireChurchSession(
    `/app/church-admin/operations/onboarding/instances/${id}`,
  );

  if (
    session.appContext.roleId !== "church-admin" &&
    session.appContext.roleId !== "pastor"
  ) {
    redirect(session.homePath);
  }

  const result = await getOnboardingInstanceAction({ instanceId: id });

  if (!result.ok || !result.instance) {
    notFound();
  }

  return <OperationsInstanceDetailClient session={session} instance={result.instance} />;
}
