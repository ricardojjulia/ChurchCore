import { redirect } from "next/navigation";

import { CcmCheckinKiosk } from "@/components/application/ccm-checkin-kiosk";
import { requireChurchSession } from "@/lib/auth";
import { getCcmServiceList } from "@/lib/ccm-data";

export default async function CcmCheckinPage() {
  const session = await requireChurchSession("/app/church-admin/children/checkin");
  if (session.appContext.roleId !== "church-admin") redirect(session.homePath);

  const services = await getCcmServiceList(session);
  const activeService =
    services.find((s) => s.status === "open" && s.checkinSessionStatus === "enabled") ?? null;

  return <CcmCheckinKiosk session={session} activeService={activeService} />;
}
