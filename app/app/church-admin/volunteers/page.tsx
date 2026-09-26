import { redirect } from "next/navigation";

import { ApplicationShell } from "@/components/application/app-shell";
import { VolunteerFrequencyInput } from "@/components/application/volunteer-frequency-input";
import { requireChurchSession } from "@/lib/auth";
import { getVolunteerDirectory } from "@/lib/volunteer-data";
import {
  Badge,
  Group,
  Paper,
  Stack,
  Table,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
  Text,
  Title,
} from "@mantine/core";
import { ShieldCheck } from "lucide-react";

const NAV_ITEMS = [
  { href: "/app/church-admin", label: "Home", description: "Church admin", icon: "Users" },
  { href: "/app/church-admin/volunteers", label: "Volunteers", description: "Directory & hours", icon: "Users", active: true },
  { href: "/app/church-admin/volunteers/schedules", label: "Schedules", description: "Service plans", icon: "CalendarCheck" },
  { href: "/app/church-admin/volunteers/role-types", label: "Role Types", description: "Team roster taxonomy", icon: "ShieldCheck" },
];

const ONE_YEAR_AGO = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

export default async function VolunteerDirectoryPage() {
  const session = await requireChurchSession("/app/church-admin/volunteers");
  if (
    session.appContext.roleId !== "church-admin" &&
    session.appContext.roleId !== "pastor" &&
    session.appContext.roleId !== "ministry-leader"
  ) {
    redirect(session.homePath);
  }

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
              <TableThead>
                <TableTr>
                  <TableTh>Name</TableTh>
                  <TableTh>Email</TableTh>
                  <TableTh>Shifts (year)</TableTh>
                  <TableTh>Hours (year)</TableTh>
                  <TableTh>Last served</TableTh>
                  <TableTh>Background check</TableTh>
                  <TableTh>Skills</TableTh>
                  <TableTh>Monthly limit</TableTh>
                </TableTr>
              </TableThead>
              <TableTbody>
                {volunteers.map((v) => {
                  const checkExpired = v.backgroundCheckDate
                    ? new Date(v.backgroundCheckDate) < ONE_YEAR_AGO
                    : true;
                  return (
                    <TableTr key={v.profileId}>
                      <TableTd fw={500}>{v.fullName}</TableTd>
                      <TableTd><Text size="sm" c="dimmed">{v.email ?? "—"}</Text></TableTd>
                      <TableTd><Text size="sm">{v.shiftsThisYear}</Text></TableTd>
                      <TableTd><Text size="sm">{v.totalHours.toFixed(1)} hrs</Text></TableTd>
                      <TableTd>
                        <Text size="sm" c="dimmed">
                          {v.lastServedDate ? new Date(v.lastServedDate).toLocaleDateString() : "—"}
                        </Text>
                      </TableTd>
                      <TableTd>
                        {v.backgroundCheckDate ? (
                          <Badge size="sm" color={checkExpired ? "red" : "green"} leftSection={<ShieldCheck size={11} />} variant="light">
                            {checkExpired ? "Expired" : new Date(v.backgroundCheckDate).toLocaleDateString()}
                          </Badge>
                        ) : (
                          <Badge size="sm" color="orange" variant="light">Not on file</Badge>
                        )}
                      </TableTd>
                      <TableTd>
                        <Group gap={4}>
                          {v.skills.slice(0, 3).map((s) => (
                            <Badge key={s} size="xs" variant="outline">{s}</Badge>
                          ))}
                        </Group>
                      </TableTd>
                      <TableTd>
                        <VolunteerFrequencyInput
                          profileId={v.profileId}
                          fullName={v.fullName}
                          initialValue={v.maxServicesPerMonth}
                        />
                      </TableTd>
                    </TableTr>
                  );
                })}
              </TableTbody>
            </Table>
          </Paper>
        )}
      </Stack>
    </ApplicationShell>
  );
}
