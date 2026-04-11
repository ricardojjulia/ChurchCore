import { redirect } from "next/navigation";

import { isChurchAppContext, requireSession } from "@/lib/auth";

export default async function LegacyCalendarPage() {
  const session = await requireSession("/calendar");

  redirect(isChurchAppContext(session.appContext) ? "/app/calendar" : "/control");
}
