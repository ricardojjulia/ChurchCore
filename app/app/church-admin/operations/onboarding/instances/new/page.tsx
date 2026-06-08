import { redirect } from "next/navigation";

import { requireChurchSession } from "@/lib/auth";
import { createTenantServerClient } from "@/lib/supabase/tenant";
import { listOnboardingTemplatesAction } from "@/app/app/church-admin/operations/actions";
import { OperationsStartInstanceClient } from "@/components/application/operations-start-instance-client";

export default async function OperationsOnboardingInstanceNewPage() {
  const session = await requireChurchSession(
    "/app/church-admin/operations/onboarding/instances/new",
  );

  if (
    session.appContext.roleId !== "church-admin" &&
    session.appContext.roleId !== "pastor"
  ) {
    redirect(session.homePath);
  }

  const churchId = session.appContext.church.id;

  const supabase = await createTenantServerClient();
  const { data: memberRows } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("church_id", churchId)
    .order("full_name", { ascending: true });

  const profiles = (memberRows ?? []).map((r) => ({
    id: r.id as string,
    fullName: (r.full_name as string | null) ?? "Unknown",
  }));

  const templatesResult = await listOnboardingTemplatesAction();
  const templates = templatesResult.ok ? (templatesResult.templates ?? []) : [];

  return (
    <OperationsStartInstanceClient
      session={session}
      profiles={profiles}
      templates={templates}
    />
  );
}
