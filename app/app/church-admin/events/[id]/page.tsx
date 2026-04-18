import { notFound, redirect } from "next/navigation";

import {
  ChurchAdminEventWorkspace,
  EventRegistrationsPanel,
} from "@/components/application/church-admin-event-workspace";
import { requireChurchSession } from "@/lib/auth";
import {
  getChurchAdminEventWorkspaceData,
  getEventRegistrations,
} from "@/lib/church-admin-events-data";
import { ApplicationShell } from "@/components/application/app-shell";
import { Tabs } from "@mantine/core";
import { Users, ClipboardList } from "lucide-react";

export default async function ChurchAdminEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireChurchSession(`/app/church-admin/events/${id}`);

  if (
    session.appContext.roleId !== "church-admin" &&
    session.appContext.roleId !== "pastor"
  ) {
    redirect(session.homePath);
  }

  const [data, { registrations, settings }] = await Promise.all([
    getChurchAdminEventWorkspaceData(session, id),
    getEventRegistrations(session, id),
  ]);

  if (!data) {
    notFound();
  }

  return (
    <ApplicationShell
      session={session}
      workspaceHref={session.homePath}
      calendarHref="/app/calendar"
      sectionLabel="Events"
      title={data.event.title}
      description={session.appContext.church.name}
      sidebarTitle="Event management"
      sidebarDescription="Roster, attendance & registrations"
      navLabel="Church admin"
      navItems={[
        { href: "/app/church-admin/events", label: "Events", description: "All events", icon: ClipboardList, active: false },
      ]}
    >
      <Tabs defaultValue="roster" p="md">
        <Tabs.List mb="md">
          <Tabs.Tab value="roster" leftSection={<Users size={14} />}>Roster & Attendance</Tabs.Tab>
          <Tabs.Tab value="registrations" leftSection={<ClipboardList size={14} />}>
            Registrations ({registrations.filter((r) => r.status !== "cancelled").length})
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="roster">
          <ChurchAdminEventWorkspace session={session} data={data} embedded />
        </Tabs.Panel>

        <Tabs.Panel value="registrations">
          <EventRegistrationsPanel
            session={session}
            eventId={id}
            registrations={registrations}
            settings={settings}
          />
        </Tabs.Panel>
      </Tabs>
    </ApplicationShell>
  );
}
