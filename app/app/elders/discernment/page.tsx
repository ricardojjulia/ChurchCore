import { redirect } from "next/navigation";

import { DiscernmentRoomDashboard } from "@/components/elders/discernment-room-dashboard";
import { requireChurchSession } from "@/lib/auth";
import { getDiscernmentRoomData } from "@/lib/elders-data";

export default async function DiscernmentRoomPage() {
  const session = await requireChurchSession("/app/pastor");

  // Role guard — pastor / elder only
  if (session.appContext.roleId !== "pastor") {
    redirect(session.homePath);
  }

  const data = await getDiscernmentRoomData(session);

  return <DiscernmentRoomDashboard session={session} data={data} />;
}
