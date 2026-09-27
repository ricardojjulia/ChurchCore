import { redirect } from "next/navigation";

import { ApplicationShell } from "@/components/application/app-shell";
import { MemberBottomNav } from "@/components/application/member-bottom-nav";
import { requireChurchSession } from "@/lib/auth";
import { getMemberSchedule } from "@/lib/volunteer-data";
import { MemberScheduleView } from "@/components/application/member-schedule";
import { BlockoutDatesPanel } from "@/components/application/blockout-dates-panel";
import { listMyBlockoutDatesAction } from "@/app/app/volunteer-actions";
import { Stack } from "@mantine/core";

export default async function MemberSchedulePage() {
  const session = await requireChurchSession("/app/member/schedule");
  if (session.appContext.roleId !== "member") redirect(session.homePath);

  const [shifts, blockoutDates] = await Promise.all([getMemberSchedule(session), listMyBlockoutDatesAction()]);

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
        { href: "/app/member", label: "Home", description: "My church", icon: "CalendarCheck" },
        { href: "/app/member/schedule", label: "Schedule", description: "My assignments", icon: "CalendarCheck", active: true },
      ]}
      bottomNav={<MemberBottomNav />}
    >
      <Stack gap="lg">
        <MemberScheduleView shifts={shifts} />
        <BlockoutDatesPanel target={{ kind: "self" }} initialDates={blockoutDates} />
      </Stack>
    </ApplicationShell>
  );
}
