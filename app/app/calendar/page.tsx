import type { Metadata } from "next";

import { CalendarHub } from "@/components/application/calendar-hub";
import { requireChurchSession } from "@/lib/auth";
import { getChurchCalendarData } from "@/lib/church-calendar-data";

export const metadata: Metadata = {
  title: "Church Calendar | ChurchCore",
  description:
    "Tenant-facing working calendar for events, volunteer coverage, approvals, and ministry operations.",
};

export default async function ChurchCalendarPage() {
  const session = await requireChurchSession("/app/calendar");
  const data = await getChurchCalendarData(session);

  return <CalendarHub session={session} data={data} />;
}
