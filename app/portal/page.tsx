import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireChurchSession } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Churchgoer Portal | ChurchForge",
  description: "Dedicated member entry route for the ChurchForge churchgoer portal.",
};

export default async function ChurchgoerPortalPage() {
  const session = await requireChurchSession("/portal");

  if (session.appContext.roleId === "member") {
    redirect("/app/member");
  }

  redirect(session.homePath);
}
