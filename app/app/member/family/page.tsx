import { redirect } from "next/navigation";

import { MemberFamilyWorkspace } from "@/components/application/member-family-workspace";
import { requireChurchSession } from "@/lib/auth";
import { getMemberPortalData } from "@/lib/member-portal-data";

export default async function MemberFamilyPage() {
  const session = await requireChurchSession("/app/member/family");

  if (session.appContext.roleId !== "member") {
    redirect(session.homePath);
  }

  const data = await getMemberPortalData(session);

  return <MemberFamilyWorkspace session={session} data={data} />;
}
