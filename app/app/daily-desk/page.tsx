import { redirect } from "next/navigation";

import { DailyDeskWorkspace } from "@/components/application/daily-desk-workspace";
import { requireChurchSession } from "@/lib/auth";
import { getDailyDeskData } from "@/lib/daily-desk-data";

export default async function DailyDeskPage() {
  const session = await requireChurchSession("/app/daily-desk");

  if (
    session.appContext.roleId !== "church-admin" &&
    session.appContext.roleId !== "pastor"
  ) {
    redirect(session.homePath);
  }

  const data = await getDailyDeskData(session);

  return <DailyDeskWorkspace session={session} data={data} />;
}
