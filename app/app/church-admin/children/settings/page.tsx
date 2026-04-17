import { redirect } from "next/navigation";

import { CcmSettings } from "@/components/application/ccm-service-manager";
import { requireChurchSession } from "@/lib/auth";

export default async function CcmSettingsPage() {
  const session = await requireChurchSession("/app/church-admin/children/settings");
  if (session.appContext.roleId !== "church-admin") redirect(session.homePath);

  return <CcmSettings session={session} />;
}
