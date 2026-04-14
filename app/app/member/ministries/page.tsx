import { redirect } from "next/navigation";

import { MemberMinistriesWorkspace } from "@/components/application/member-ministries-workspace";
import { requireChurchSession } from "@/lib/auth";
import { getMemberMinistriesData } from "@/lib/ministry-forge-data";

export default async function MemberMinistriesPage() {
  const session = await requireChurchSession("/app/member/ministries");

  if (session.appContext.roleId !== "member") {
    redirect(session.homePath);
  }

  const data = await getMemberMinistriesData(session);

  return <MemberMinistriesWorkspace session={session} data={data} />;
}
