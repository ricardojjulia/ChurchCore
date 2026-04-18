import { redirect } from "next/navigation";

import { ApplicationShell } from "@/components/application/app-shell";
import { VisitorPipeline } from "@/components/application/visitor-pipeline";
import { requireChurchSession } from "@/lib/auth";
import { getFirstTimeVisitors } from "@/lib/groups-data";
import { HeartHandshake, UserPlus, Users } from "lucide-react";

const NAV_ITEMS = [
  {
    href: "/app/church-admin",
    label: "Home",
    description: "Church admin",
    icon: HeartHandshake,
  },
  {
    href: "/app/church-admin/visitors",
    label: "Visitors",
    description: "First-visit pipeline",
    icon: UserPlus,
    active: true,
  },
  {
    href: "/app/church-admin/people",
    label: "People",
    description: "Member directory",
    icon: Users,
  },
];

export default async function VisitorPipelinePage() {
  const session = await requireChurchSession("/app/church-admin/visitors");

  if (session.appContext.roleId !== "church-admin") {
    redirect(session.homePath);
  }

  const visitors = await getFirstTimeVisitors(session);

  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/church-admin"
      calendarHref="/app/calendar"
      sectionLabel="People"
      title="First-Visit Pipeline"
      description={session.appContext.church.name}
      sidebarTitle="Visitor Follow-up"
      sidebarDescription="Track first-time visitors through your outreach workflow."
      navLabel="Church admin"
      navItems={NAV_ITEMS}
    >
      <VisitorPipeline visitors={visitors} />
    </ApplicationShell>
  );
}
