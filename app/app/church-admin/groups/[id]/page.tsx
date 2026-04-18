import { redirect, notFound } from "next/navigation";

import { GroupDetailWorkspace } from "@/components/application/groups-workspace";
import { requireChurchSession } from "@/lib/auth";
import { getGroupDetail } from "@/lib/groups-data";

export default async function GroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireChurchSession("/app/church-admin/groups");
  const role = session.appContext.roleId;
  if (role !== "church-admin" && role !== "pastor") redirect(session.homePath);

  const { id } = await params;
  const detail = await getGroupDetail(session, id);
  if (!detail || !detail.group.id) notFound();

  return <GroupDetailWorkspace session={session} detail={detail} />;
}
