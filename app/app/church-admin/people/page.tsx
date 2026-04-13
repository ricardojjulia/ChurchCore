import { redirect } from "next/navigation";

import { ChurchAdminPeopleWorkspace } from "@/components/application/church-admin-people-workspace";
import { requireChurchSession } from "@/lib/auth";
import { getChurchAdminPeopleData } from "@/lib/church-admin-people-data";

export default async function ChurchAdminPeoplePage() {
  const session = await requireChurchSession("/app/church-admin/people");

  if (session.appContext.roleId !== "church-admin") {
    redirect(session.homePath);
  }

  const data = await getChurchAdminPeopleData(session);

  return <ChurchAdminPeopleWorkspace session={session} data={data} />;
}
