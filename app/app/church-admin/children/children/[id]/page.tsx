import { notFound, redirect } from "next/navigation";

import { CcmChildProfileView } from "@/components/application/ccm-child-profile";
import { requireChurchSession } from "@/lib/auth";
import { getChildProfile } from "@/lib/ccm-data";

export default async function CcmChildProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireChurchSession("/app/church-admin/children/children");
  if (session.appContext.roleId !== "church-admin") redirect(session.homePath);

  const profile = await getChildProfile(session, id);
  if (!profile) notFound();

  return <CcmChildProfileView session={session} profile={profile} />;
}
