import { redirect } from "next/navigation";

import { PastorPeopleWorkspace } from "@/components/application/pastor-people-workspace";
import { requireChurchSession } from "@/lib/auth";
import { getPastorPortalData } from "@/lib/pastor-portal-data";

export default async function PastorPeoplePage() {
  const session = await requireChurchSession("/app/pastor/people");

  if (session.appContext.roleId !== "pastor") {
    redirect(session.homePath);
  }

  const data = await getPastorPortalData(session);

  return <PastorPeopleWorkspace session={session} data={data} />;
}
