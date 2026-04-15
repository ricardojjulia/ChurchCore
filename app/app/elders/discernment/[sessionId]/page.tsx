import { notFound, redirect } from "next/navigation";

import { DiscernmentSessionDetailView } from "@/components/elders/discernment-session-detail";
import { requireChurchSession } from "@/lib/auth";
import { getDiscernmentSessionDetail } from "@/lib/elders-data";

export default async function DiscernmentSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const session = await requireChurchSession("/app/pastor");

  // Role guard — pastor / elder only
  if (session.appContext.roleId !== "pastor") {
    redirect(session.homePath);
  }

  const detail = await getDiscernmentSessionDetail(session, sessionId);

  if (!detail) {
    notFound();
  }

  return <DiscernmentSessionDetailView session={session} detail={detail} />;
}
