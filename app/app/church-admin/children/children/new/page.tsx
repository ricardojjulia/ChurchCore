import { redirect } from "next/navigation";

import { CcmNewChildForm } from "@/components/application/ccm-child-profile";
import { requireChurchSession } from "@/lib/auth";

export default async function CcmNewChildPage() {
  const session = await requireChurchSession("/app/church-admin/children/children");
  if (session.appContext.roleId !== "church-admin") redirect(session.homePath);

  return <CcmNewChildForm session={session} />;
}
