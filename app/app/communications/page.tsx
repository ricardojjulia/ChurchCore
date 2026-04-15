import { redirect } from "next/navigation";

import { CommunicationsHub } from "@/components/application/communications-hub";
import { requireChurchSession } from "@/lib/auth";
import { getCommunicationsHubData } from "@/lib/communications-data";

export default async function CommunicationsPage() {
  const session = await requireChurchSession("/app/pastor");

  // Role guard — pastor and church-admin only
  const role = session.appContext.roleId;
  if (role !== "pastor" && role !== "church-admin") {
    redirect(session.homePath);
  }

  const data = await getCommunicationsHubData(session);

  return <CommunicationsHub session={session} data={data} />;
}
