import { redirect } from "next/navigation";

import { ApplicationShell } from "@/components/application/app-shell";
import { ServicePlansWorkspace } from "@/components/application/volunteer-schedule";
import { requireChurchSession } from "@/lib/auth";
import { getServicePlanList, getServicePlanTemplates } from "@/lib/volunteer-data";
import { CalendarCheck, Users } from "lucide-react";

const NAV_ITEMS = [
  { href: "/app/church-admin", label: "Home", description: "Church admin", icon: Users },
  { href: "/app/church-admin/volunteers", label: "Volunteers", description: "Directory & hours", icon: Users },
  { href: "/app/church-admin/volunteers/schedules", label: "Schedules", description: "Service plans", icon: CalendarCheck, active: true },
];

export default async function ServicePlansPage() {
  const session = await requireChurchSession("/app/church-admin/volunteers/schedules");
  if (session.appContext.roleId !== "church-admin") redirect(session.homePath);

  const [plans, templates] = await Promise.all([
    getServicePlanList(session, { upcoming: true }),
    getServicePlanTemplates(session),
  ]);

  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/church-admin"
      calendarHref="/app/calendar"
      sectionLabel="Volunteers"
      title="Service Plans"
      description={session.appContext.church.name}
      sidebarTitle="Service Plans"
      sidebarDescription="Build service plans, fill positions, and track volunteer confirmations."
      navLabel="Church admin"
      navItems={NAV_ITEMS}
    >
      <div style={{ padding: "var(--mantine-spacing-md)" }}>
        <ServicePlansWorkspace plans={plans} templates={templates} />
      </div>
    </ApplicationShell>
  );
}
