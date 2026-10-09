import { redirect } from "next/navigation";

import { CcmKioskStart } from "@/components/application/ccm-kiosk-start";
import { requireChurchSession } from "@/lib/auth";

// Start page for the family self check-in kiosk (G2.2): church admin only;
// startKioskAction repeats the check before it writes anything.
export default async function CcmKioskStartPage() {
  const session = await requireChurchSession("/app/church-admin/children/kiosk");
  if (session.appContext.roleId !== "church-admin") redirect(session.homePath);

  return <CcmKioskStart session={session} />;
}
