import { redirect } from "next/navigation";

import { requireChurchSession } from "@/lib/auth";
import { listOnboardingInstancesAction } from "@/app/app/church-admin/operations/actions";
import { OperationsOnboardingInstancesWorkspace } from "@/components/application/operations-onboarding-instances-workspace";

export default async function OperationsOnboardingInstancesPage() {
  const session = await requireChurchSession(
    "/app/church-admin/operations/onboarding/instances",
  );

  if (
    session.appContext.roleId !== "church-admin" &&
    session.appContext.roleId !== "pastor"
  ) {
    redirect(session.homePath);
  }

  const result = await listOnboardingInstancesAction();

  return (
    <OperationsOnboardingInstancesWorkspace
      session={session}
      instances={result.ok ? (result.instances ?? []) : []}
    />
  );
}
