import { notFound, redirect } from "next/navigation";

import { ApplicationShell } from "@/components/application/app-shell";
import { ServicePlanBuilder } from "@/components/application/volunteer-schedule";
import { requireChurchSession } from "@/lib/auth";
import { getChurchAdminEventsList } from "@/lib/church-admin-events-data";
import { getServicePlanDetail, getVolunteerPool } from "@/lib/volunteer-data";

export default async function ServicePlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireChurchSession(`/app/church-admin/volunteers/schedules/${id}`);
  if (session.appContext.roleId !== "church-admin") redirect(session.homePath);

  const detail = await getServicePlanDetail(session, id);
  if (!detail) notFound();

  const [pool, events] = await Promise.all([
    getVolunteerPool(session, detail.plan.serviceDate),
    getChurchAdminEventsList(session),
  ]);

  const NAV_ITEMS = [
    { href: "/app/church-admin", label: "Home", description: "Church admin", icon: "Users" },
    { href: "/app/church-admin/volunteers", label: "Volunteers", description: "Directory & hours", icon: "Users" },
    { href: "/app/church-admin/volunteers/schedules", label: "Schedules", description: "Service plans", icon: "CalendarCheck", active: true },
  ];

  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/church-admin"
      calendarHref="/app/calendar"
      sectionLabel="Volunteers"
      title={detail.plan.name}
      description={session.appContext.church.name}
      sidebarTitle="Service Plan"
      sidebarDescription="Assign volunteers to positions and track confirmations."
      navLabel="Church admin"
      navItems={NAV_ITEMS}
    >
      <div style={{ padding: "var(--mantine-spacing-md)" }}>
        <ServicePlanBuilder detail={detail} events={events} pool={pool} />
      </div>
    </ApplicationShell>
  );
}
