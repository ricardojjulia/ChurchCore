import { redirect } from "next/navigation";

import { MemberDirectoryWorkspace } from "@/components/application/member-directory-workspace";
import { requireChurchSession } from "@/lib/auth";
import { getMemberPortalData } from "@/lib/member-portal-data";

export default async function MemberDirectoryPage() {
  const session = await requireChurchSession("/app/member/directory");

  if (session.appContext.roleId !== "member") {
    redirect(session.homePath);
  }

  const data = await getMemberPortalData(session);

  return <MemberDirectoryWorkspace session={session} data={data} />;
}
