import { redirect } from "next/navigation";

import { CouncilForge } from "@/components/council/council-forge";
import { requireChurchSession } from "@/lib/auth";
import { getCouncilForgeData } from "@/lib/elders-data";

export default async function CouncilForgePage() {
  const session = await requireChurchSession("/app/pastor");

  // Role guard — pastor and church-admin only
  const role = session.appContext.roleId;
  if (role !== "pastor" && role !== "church-admin") {
    redirect(session.homePath);
  }

  const data = await getCouncilForgeData(session);

  return <CouncilForge session={session} data={data} />;
}
