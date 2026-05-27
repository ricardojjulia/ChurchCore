import { redirect } from "next/navigation";

import { CommunicationsHub } from "@/components/application/communications-hub";
import { requireChurchSession } from "@/lib/auth";
import { getCommunicationsHubData } from "@/lib/communications-data";
import { hasTenantBackendEnv } from "@/lib/supabase/tenant";

export default async function CommunicationsPage({
  searchParams = Promise.resolve({}),
}: {
  searchParams?: Promise<{ view?: string }>;
} = {}) {
  const session = await requireChurchSession("/app/pastor");

  // Role guard — pastor and church-admin only
  const role = session.appContext.roleId;
  if (role !== "pastor" && role !== "church-admin") {
    redirect(session.homePath);
  }

  const { view } = await searchParams;
  const data = await getCommunicationsHubData(session);

  return (
    <CommunicationsHub
      session={session}
      data={data}
      readinessView={view === "readiness"}
      dataSource={hasTenantBackendEnv() && session.source === "supabase" ? "live" : "preview"}
    />
  );
}
