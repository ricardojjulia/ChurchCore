import { redirect } from "next/navigation";

import { BibleStudyClient } from "@/components/application/bible-study-client";
import { requireChurchSession } from "@/lib/auth";

export default async function PastorBibleStudyPage() {
  const session = await requireChurchSession("/app/pastor/bible-study");

  if (session.appContext.roleId !== "pastor") {
    redirect(session.homePath);
  }

  return <BibleStudyClient session={session} />;
}
