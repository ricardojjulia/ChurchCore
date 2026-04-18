import { redirect } from "next/navigation";

import { ApplicationShell } from "@/components/application/app-shell";
import { MemberBottomNav } from "@/components/application/member-bottom-nav";
import { requireChurchSession } from "@/lib/auth";
import { getMemberSchedule } from "@/lib/volunteer-data";
import { CalendarCheck } from "lucide-react";
import { MemberScheduleView } from "@/components/application/member-schedule";

export default async function MemberSchedulePage() {
  const session = await requireChurchSession("/app/member/schedule");
  if (session.appContext.roleId !== "member") redirect(session.homePath);

  const shifts = await getMemberSchedule(session);

  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/member"
      calendarHref="/app/calendar"
      sectionLabel="My Church"
      title="My Schedule"
      description={session.appContext.church.name}
      sidebarTitle="Serving Schedule"
      sidebarDescription="Your upcoming volunteer assignments."
      navLabel="Member"
      navItems={[
        { href: "/app/member", label: "Home", description: "My church", icon: CalendarCheck },
        { href: "/app/member/schedule", label: "Schedule", description: "My assignments", icon: CalendarCheck, active: true },
      ]}
      bottomNav={<MemberBottomNav />}
    >
      <MemberScheduleView shifts={shifts} />
    </ApplicationShell>
  );
}
