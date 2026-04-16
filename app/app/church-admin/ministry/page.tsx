import { redirect } from "next/navigation";

import { requireChurchSession } from "@/lib/auth";
import { getMinistryForgeList } from "@/lib/ministry-forge-data";
import { MinistryForgeListPage } from "@/components/application/ministry-forge-list";

export default async function MinistryForgePage() {
  const session = await requireChurchSession("/app/church-admin/ministry");

  if (
    session.appContext.roleId !== "church-admin" &&
    session.appContext.roleId !== "pastor"
  ) {
    redirect(session.homePath);
  }

  const data = await getMinistryForgeList(session);

  return <MinistryForgeListPage session={session} data={data} />;
}
