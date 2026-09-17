import { redirect } from "next/navigation";

import { OnboardingWorkspace } from "@/components/onboarding/onboarding-workspace";
import { requireChurchSession } from "@/lib/auth";
import { queryTenantLocalDb } from "@/lib/supabase/tenant";

export default async function ChurchAdminOnboardingPage() {
  const session = await requireChurchSession("/app/church-admin/onboarding");

  if (session.appContext.roleId !== "church-admin") {
    redirect(session.homePath);
  }

  let isSandbox = false;

  if (session.source === "supabase") {
    try {
      const result = await queryTenantLocalDb<{ is_sandbox: boolean }>(
        "select is_sandbox from public.churches where id = $1 limit 1",
        [session.appContext.church.id],
      );
      isSandbox = result.rows[0]?.is_sandbox ?? false;
    } catch (e) {
      console.error("Failed to query sandbox status:", e);
    }
  } else {
    // Under static demo fallback mode, default to true for demonstration
    isSandbox = true;
  }

  return (
    <OnboardingWorkspace
      session={session}
      isSandbox={isSandbox}
    />
  );
}
