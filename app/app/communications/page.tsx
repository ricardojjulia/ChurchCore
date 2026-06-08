import { redirect } from "next/navigation";

import { requireChurchSession } from "@/lib/auth";

export default async function CommunicationsPage() {
  const session = await requireChurchSession("/app/pastor");

  // Role guard — pastor, church_admin, and secretary
  const role = session.appContext.roleId;
  if (role !== "pastor" && role !== "church-admin" && role !== "secretary") {
    redirect(session.homePath);
  }

  redirect("/app/communications/history");
}
