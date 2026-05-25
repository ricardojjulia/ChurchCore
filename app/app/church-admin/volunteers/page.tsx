import { redirect } from "next/navigation";

import { ApplicationShell } from "@/components/application/app-shell";
import { requireChurchSession } from "@/lib/auth";
import { getVolunteerDirectory } from "@/lib/volunteer-data";
import { Badge, Group, Paper, Stack, Table, Text, Title } from "@mantine/core";
import { ShieldCheck } from "lucide-react";

const NAV_ITEMS = [
  { href: "/app/church-admin", label: "Home", description: "Church admin", icon: "Users" },
  { href: "/app/church-admin/volunteers", label: "Volunteers", description: "Directory & hours", icon: "Users", active: true },
  { href: "/app/church-admin/volunteers/schedules", label: "Schedules", description: "Service plans", icon: "CalendarCheck" },
];

const ONE_YEAR_AGO = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

export default async function VolunteerDirectoryPage() {
  const session = await requireChurchSession("/app/church-admin/volunteers");
  if (session.appContext.roleId !== "church-admin") redirect(session.homePath);

  const volunteers = await getVolunteerDirectory(session);

  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/church-admin"
      calendarHref="/app/calendar"
      sectionLabel="Volunteers"
      title="Volunteer Directory"
      description={session.appContext.church.name}
      sidebarTitle="Volunteers"
      sidebarDescription="Directory, hours tracking, and background check status."
      navLabel="Church admin"
      navItems={NAV_ITEMS}
    >
      <Stack gap="md" p="md">
        <Group justify="space-between">
          <div>
            <Title order={3}>Volunteers</Title>
            <Text c="dimmed" size="sm">{volunteers.length} active volunteers</Text>
          </div>
        </Group>

        {volunteers.length === 0 ? (
          <Text c="dimmed" size="sm">No volunteer history yet. Assign volunteers to service plans to build this list.</Text>
        ) : (
          <Paper withBorder radius="md">
            <Table highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>Email</Table.Th>
                  <Table.Th>Shifts (year)</Table.Th>
                  <Table.Th>Hours (year)</Table.Th>
                  <Table.Th>Last served</Table.Th>
                  <Table.Th>Background check</Table.Th>
                  <Table.Th>Skills</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {volunteers.map((v) => {
                  const checkExpired = v.backgroundCheckDate
                    ? new Date(v.backgroundCheckDate) < ONE_YEAR_AGO
                    : true;
                  return (
                    <Table.Tr key={v.profileId}>
                      <Table.Td fw={500}>{v.fullName}</Table.Td>
                      <Table.Td><Text size="sm" c="dimmed">{v.email ?? "—"}</Text></Table.Td>
                      <Table.Td><Text size="sm">{v.shiftsThisYear}</Text></Table.Td>
                      <Table.Td><Text size="sm">{v.totalHours.toFixed(1)} hrs</Text></Table.Td>
                      <Table.Td>
                        <Text size="sm" c="dimmed">
                          {v.lastServedDate ? new Date(v.lastServedDate).toLocaleDateString() : "—"}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        {v.backgroundCheckDate ? (
                          <Badge size="sm" color={checkExpired ? "red" : "green"} leftSection={<ShieldCheck size={11} />} variant="light">
                            {checkExpired ? "Expired" : new Date(v.backgroundCheckDate).toLocaleDateString()}
                          </Badge>
                        ) : (
                          <Badge size="sm" color="orange" variant="light">Not on file</Badge>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Group gap={4}>
                          {v.skills.slice(0, 3).map((s) => (
                            <Badge key={s} size="xs" variant="outline">{s}</Badge>
                          ))}
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Paper>
        )}
      </Stack>
    </ApplicationShell>
  );
}
