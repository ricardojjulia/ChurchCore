import { redirect } from "next/navigation";

import { CcmChildDirectory } from "@/components/application/ccm-child-profile";
import { requireChurchSession } from "@/lib/auth";
import { getChurchAdminPeopleData } from "@/lib/church-admin-people-data";

export default async function CcmChildrenPage() {
  const session = await requireChurchSession("/app/church-admin/children/children");
  if (session.appContext.roleId !== "church-admin") redirect(session.homePath);

  const peopleData = await getChurchAdminPeopleData(session);

  return <CcmChildDirectory session={session} people={peopleData.people} />;
}
