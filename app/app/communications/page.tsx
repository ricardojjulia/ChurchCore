import { redirect } from "next/navigation";

import { CommunicationsHub } from "@/components/application/communications-hub";
import { requireChurchSession } from "@/lib/auth";
import { getCommunicationsHubData } from "@/lib/communications-data";
import { hasTenantBackendEnv } from "@/lib/supabase/tenant";

export default async function CommunicationsPage({
  searchParams,
}: {
  searchParams?: Promise<{ view?: string }>;
}) {
  const session = await requireChurchSession("/app/communications");

  // Role guard — pastor, church_admin, and secretary
  const role = session.appContext.roleId;
  if (role !== "pastor" && role !== "church-admin" && role !== "secretary") {
    redirect(session.homePath);
  }

  const params = searchParams ? await searchParams : {};
  const data = await getCommunicationsHubData(session);

  return (
    <CommunicationsHub
      session={session}
      data={data}
      readinessView={params.view === "readiness"}
      dataSource={hasTenantBackendEnv() && session.source === "supabase" ? "live" : "preview"}
    />
  );
}
