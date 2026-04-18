import { redirect } from "next/navigation";

import { GroupsWorkspace } from "@/components/application/groups-workspace";
import { requireChurchSession } from "@/lib/auth";
import { getGroupsList } from "@/lib/groups-data";

export default async function GroupsPage() {
  const session = await requireChurchSession("/app/church-admin");
  const role = session.appContext.roleId;
  if (role !== "church-admin" && role !== "pastor") redirect(session.homePath);

  const data = await getGroupsList(session);
  return <GroupsWorkspace session={session} data={data} />;
}
