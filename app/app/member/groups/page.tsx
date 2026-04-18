import { Users } from "lucide-react";

import { ApplicationShell } from "@/components/application/app-shell";
import { MemberBottomNav } from "@/components/application/member-bottom-nav";
import { MemberGroupsBrowser } from "@/components/application/member-groups-browser";
import { requireChurchSession } from "@/lib/auth";
import { getGroupsList } from "@/lib/groups-data";

export default async function MemberGroupsPage() {
  const session = await requireChurchSession("/app/member/groups");

  const data = await getGroupsList(session, { activeOnly: true });

  const navItems = [
    { href: "/app/member", label: "Home", description: "Member overview", icon: Users },
    { href: "/app/member/groups", label: "Groups", description: "Browse small groups", icon: Users, active: true },
  ];

  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/member"
      calendarHref="/app/calendar"
      sectionLabel="Member"
      title="Small Groups"
      description={session.appContext.church.name}
      sidebarTitle="Groups"
      sidebarDescription="Find and join a small group."
      navLabel="Member"
      navItems={navItems}
      bottomNav={<MemberBottomNav />}
    >
      <MemberGroupsBrowser session={session} data={data} />
    </ApplicationShell>
  );
}
