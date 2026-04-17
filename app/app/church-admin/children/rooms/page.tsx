import { redirect } from "next/navigation";

import { CcmRoomManager } from "@/components/application/ccm-service-manager";
import { requireChurchSession } from "@/lib/auth";

export default async function CcmRoomsPage() {
  const session = await requireChurchSession("/app/church-admin/children/rooms");
  if (session.appContext.roleId !== "church-admin") redirect(session.homePath);

  return <CcmRoomManager session={session} />;
}
