import { redirect } from "next/navigation";

import { ChurchAdminSettingsWorkspace } from "@/components/application/church-admin-settings-workspace";
import { requireChurchSession } from "@/lib/auth";
import { getChurchSettingsData } from "@/lib/church-settings-data";

export default async function ChurchAdminSettingsPage() {
  const session = await requireChurchSession("/app/church-admin/settings");

  if (session.appContext.roleId !== "church-admin") {
    redirect(session.homePath);
  }

  const settings = await getChurchSettingsData(session);

  return <ChurchAdminSettingsWorkspace session={session} settings={settings} />;
}
