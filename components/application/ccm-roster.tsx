"use client";

import Link from "next/link";
import {
  Badge,
  Button,
  Group,
  Paper,
  Stack,
  Table,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
import { AlertTriangle, Printer, Users } from "lucide-react";

import { ApplicationShell } from "@/components/application/app-shell";
import { ccmNavItems } from "@/components/application/ccm-nav";
import type { ChurchAppSession } from "@/lib/auth";
import type { CcmRosterData, EmergencyRosterData } from "@/lib/ccm-types";

const STATUS_COLOR: Record<string, string> = {
  checked_in: "teal",
  checked_out: "gray",
  late_pickup: "red",
  emergency: "red",
  transferred: "blue",
};

export function CcmRosterView({
  session,
  roster,
}: {
  session: ChurchAppSession;
  roster: CcmRosterData;
}) {
  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/church-admin"
      calendarHref="/app/calendar"
      sectionLabel="Children's Ministry"
      title={`Roster — ${roster.service.serviceName}`}
      description={roster.service.serviceDate}
      sidebarTitle="Children's Ministry"
      sidebarDescription="Service roster"
      navLabel="CCM"
      navItems={ccmNavItems("/app/church-admin/children/services")}
    >
      <Stack gap="lg">
        <Group justify="space-between">
          <Group gap="md">
            <Paper withBorder p="sm" radius="md" ta="center" style={{ minWidth: 90 }}>
              <Text size="xs" c="dimmed">Children</Text>
              <Text fw={700} size="xl">{roster.totalChildren}</Text>
            </Paper>
            <Paper withBorder p="sm" radius="md" ta="center" style={{ minWidth: 90 }}>
              <Text size="xs" c="dimmed">Volunteers</Text>
              <Text fw={700} size="xl">{roster.totalVolunteers}</Text>
            </Paper>
            <Paper withBorder p="sm" radius="md" ta="center" style={{ minWidth: 90 }}>
              <Text size="xs" c="dimmed">Incidents</Text>
              <Text fw={700} size="xl">{roster.incidents.length}</Text>
            </Paper>
          </Group>
          <Button
            leftSection={<Printer size={14} />}
            variant="light"
            onClick={() => window.print()}
          >
            Print
          </Button>
        </Group>

        <Paper withBorder p="md" radius="md">
          <Group mb="sm">
            <ThemeIcon color="churchBlue" variant="light" size="lg" radius="md">
              <Users size={18} />
            </ThemeIcon>
            <Title order={5}>Attendance Roster</Title>
          </Group>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Child</Table.Th>
                <Table.Th>Room</Table.Th>
                <Table.Th>Guardian</Table.Th>
                <Table.Th>Checked In</Table.Th>
                <Table.Th>Checked Out</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Allergies</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {roster.sessions.map((s) => (
                <Table.Tr key={s.id}>
                  <Table.Td>
                    <Group gap="xs">
                      {s.noPhotoFlag && <Badge color="red" size="xs">No Photos</Badge>}
                      <Text size="sm" fw={500}>{s.childName}</Text>
                      {s.isFirstVisit && <Badge color="violet" size="xs">New</Badge>}
                    </Group>
                  </Table.Td>
                  <Table.Td>{s.roomName}</Table.Td>
                  <Table.Td>{s.guardianName ?? "—"}</Table.Td>
                  <Table.Td>
                    <Text size="xs">{new Date(s.checkedInAt).toLocaleTimeString()}</Text>
                  </Table.Td>
                  <Table.Td>
                    {s.checkedOutAt
                      ? <Text size="xs">{new Date(s.checkedOutAt).toLocaleTimeString()}</Text>
                      : <Text size="xs" c="dimmed">—</Text>}
                  </Table.Td>
                  <Table.Td>
                    <Badge color={STATUS_COLOR[s.status] ?? "gray"} size="xs">
                      {s.status.replace("_", " ")}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    {s.criticalAllergies.length > 0
                      ? <Badge color="red" size="xs">{s.criticalAllergies.join(", ")}</Badge>
                      : <Text size="xs" c="dimmed">None</Text>}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Paper>

        {roster.incidents.length > 0 && (
          <Paper withBorder p="md" radius="md">
            <Group mb="sm">
              <ThemeIcon color="orange" variant="light" size="lg" radius="md">
                <AlertTriangle size={18} />
              </ThemeIcon>
              <Title order={5}>Incidents</Title>
            </Group>
            <Table striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Child</Table.Th>
                  <Table.Th>Type</Table.Th>
                  <Table.Th>Severity</Table.Th>
                  <Table.Th>Guardian Notified</Table.Th>
                  <Table.Th>Follow-up</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {roster.incidents.map((inc) => (
                  <Table.Tr key={inc.id}>
                    <Table.Td>{inc.childName}</Table.Td>
                    <Table.Td>
                      <Badge size="xs">{inc.incidentType.replace("_", " ")}</Badge>
                    </Table.Td>
                    <Table.Td>
                      <Badge
                        size="xs"
                        color={
                          inc.severity === "critical"
                            ? "red"
                            : inc.severity === "high"
                              ? "orange"
                              : inc.severity === "medium"
                                ? "yellow"
                                : "gray"
                        }
                      >
                        {inc.severity}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Badge color={inc.guardianNotified ? "teal" : "red"} size="xs">
                        {inc.guardianNotified ? "Yes" : "No"}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      {inc.followUpRequired
                        ? <Badge color="orange" size="xs">Required</Badge>
                        : <Text size="xs" c="dimmed">None</Text>}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Paper>
        )}
      </Stack>
    </ApplicationShell>
  );
}

// ── Emergency roster (print-optimised, no PII beyond allergy) ────────────────

export function CcmEmergencyRoster({ roster }: { roster: EmergencyRosterData | null }) {
  const groupedByRoom: Record<string, NonNullable<typeof roster>["entries"]> = {};
  if (roster) {
    for (const entry of roster.entries) {
      if (!groupedByRoom[entry.roomName]) groupedByRoom[entry.roomName] = [];
      groupedByRoom[entry.roomName].push(entry);
    }
  }

  return (
    <Stack gap="lg" p="md">
      <Group justify="space-between" className="no-print">
        <Title order={3}>Emergency Roster</Title>
        <Button leftSection={<Printer size={14} />} onClick={() => window.print()}>
          Print
        </Button>
      </Group>

      {!roster || roster.entries.length === 0 ? (
        <Text c="dimmed">No children currently checked in.</Text>
      ) : (
        <>
          <Text size="xs" c="dimmed">
            Generated: {new Date(roster.generatedAt).toLocaleString()} ·{" "}
            Service: {roster.service?.serviceName ?? "Unknown"} ·{" "}
            Total: {roster.entries.length} children
          </Text>
          {Object.entries(groupedByRoom).map(([room, entries]) => (
            <Paper key={room} withBorder p="md" radius="md">
              <Title order={5} mb="sm">{room} — {entries.length} children</Title>
              <Table striped>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Child Name</Table.Th>
                    <Table.Th>Allergy Alert</Table.Th>
                    <Table.Th>Guardian</Table.Th>
                    <Table.Th>Check-In Time</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {entries.map((e, i) => (
                    <Table.Tr key={i}>
                      <Table.Td><Text fw={600}>{e.childName}</Text></Table.Td>
                      <Table.Td>
                        {e.criticalAllergies.length > 0
                          ? <Badge color="red" size="sm">{e.criticalAllergies.join(", ")}</Badge>
                          : <Text size="sm" c="dimmed">None</Text>}
                      </Table.Td>
                      <Table.Td>{e.guardianName ?? "—"}</Table.Td>
                      <Table.Td>
                        <Text size="xs">{new Date(e.checkedInAt).toLocaleTimeString()}</Text>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Paper>
          ))}
        </>
      )}
      <Text size="xs" c="dimmed">
        This roster is for emergency use only. Contains no private medical notes.
        <Link href="/app/church-admin/children/dashboard" className="no-print"> Return to Dashboard</Link>
      </Text>
    </Stack>
  );
}
