import { redirect } from "next/navigation";

import { requireChurchSession } from "@/lib/auth";
import {
  listOnboardingTemplatesAction,
  listOnboardingInstancesAction,
} from "@/app/app/church-admin/operations/actions";
import { OperationsOnboardingWorkspace } from "@/components/application/operations-onboarding-workspace";

export default async function OperationsOnboardingPage() {
  const session = await requireChurchSession("/app/church-admin/operations/onboarding");

  if (
    session.appContext.roleId !== "church-admin" &&
    session.appContext.roleId !== "pastor"
  ) {
    redirect(session.homePath);
  }

  const [templatesResult, instancesResult] = await Promise.all([
    listOnboardingTemplatesAction(),
    listOnboardingInstancesAction(),
  ]);

  return (
    <OperationsOnboardingWorkspace
      session={session}
      templates={templatesResult.ok ? (templatesResult.templates ?? []) : []}
      instances={instancesResult.ok ? (instancesResult.instances ?? []) : []}
    />
  );
}
