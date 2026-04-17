import { redirect } from "next/navigation";

import { CcmOpenServiceForm } from "@/components/application/ccm-service-manager";
import { requireChurchSession } from "@/lib/auth";

export default async function CcmNewServicePage() {
  const session = await requireChurchSession("/app/church-admin/children/services");
  if (session.appContext.roleId !== "church-admin") redirect(session.homePath);

  return <CcmOpenServiceForm session={session} />;
}
