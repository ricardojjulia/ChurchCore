"use client";

import {
  Badge,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Table,
  Text,
  ThemeIcon,
} from "@mantine/core";
import { Globe, MapPin } from "lucide-react";

import { AI_ASSISTIVE_DISCLAIMER } from "@/lib/ministry-forge-types";
import type { OutreachTrackData } from "@/lib/ministry-forge-types";

const COVERAGE_COLOR: Record<string, string> = {
  low: "red",
  medium: "yellow",
  high: "green",
};

const COVERAGE_LABEL: Record<string, string> = {
  low: "Low Coverage",
  medium: "Medium Coverage",
  high: "Well Covered",
};

const STATUS_COLOR: Record<string, string> = {
  planned: "blue",
  completed: "green",
  cancelled: "gray",
};

export function OutreachTrackPanel({ data }: { data: OutreachTrackData }) {
  const { events, zones, totalVolunteerHours, totalPeopleServed } = data;

  const completedEvents = events.filter((e) => e.status === "completed");
  const upcomingEvents = events.filter((e) => e.status === "planned");
  const lowCoverageZones = zones.filter((z) => z.coverageLevel === "low");

  return (
    <Stack gap="lg">
      {/* Impact Summary */}
      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
        <Paper withBorder p="md" radius="md">
          <Text size="xs" c="dimmed">Events Completed</Text>
          <Text fw={700} size="xl" c="green">{completedEvents.length}</Text>
        </Paper>
        <Paper withBorder p="md" radius="md">
          <Text size="xs" c="dimmed">Upcoming Events</Text>
          <Text fw={700} size="xl" c="blue">{upcomingEvents.length}</Text>
        </Paper>
        <Paper withBorder p="md" radius="md">
          <Text size="xs" c="dimmed">Est. Volunteer Hours</Text>
          <Text fw={700} size="xl">{totalVolunteerHours}</Text>
        </Paper>
        <Paper withBorder p="md" radius="md">
          <Text size="xs" c="dimmed">People Served</Text>
          <Text fw={700} size="xl" c="teal">{totalPeopleServed}</Text>
        </Paper>
      </SimpleGrid>

      {/* Neighborhood Density — Zone Heatmap */}
      <Paper withBorder p="md" radius="md">
        <Group mb="sm">
          <ThemeIcon color="teal" variant="light" size="lg" radius="md">
            <MapPin size={18} />
          </ThemeIcon>
          <div>
            <Text fw={600}>Neighborhood Density</Text>
            <Text size="xs" c="dimmed">
              Zone-by-zone coverage showing where outreach is strong — and where the gaps are.
            </Text>
          </div>
        </Group>
        {lowCoverageZones.length > 0 && (
          <Text size="xs" c="red" mb="sm">
            {lowCoverageZones.length} zone{lowCoverageZones.length > 1 ? "s" : ""} with low coverage —
            consider scheduling outreach in {lowCoverageZones.map((z) => z.zoneName).join(", ")}.
          </Text>
        )}
        {zones.length === 0 ? (
          <Text size="sm" c="dimmed">No zones defined. Add outreach events to build the neighborhood map.</Text>
        ) : (
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Zone / Neighborhood</Table.Th>
                <Table.Th>Events</Table.Th>
                <Table.Th>Volunteers</Table.Th>
                <Table.Th>People Served</Table.Th>
                <Table.Th>Last Event</Table.Th>
                <Table.Th>Coverage</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {zones.map((z) => (
                <Table.Tr key={z.id}>
                  <Table.Td>
                    <Text fw={500} size="sm">{z.zoneName}</Text>
                    {z.description && <Text size="xs" c="dimmed">{z.description}</Text>}
                  </Table.Td>
                  <Table.Td>{z.totalEvents}</Table.Td>
                  <Table.Td>{z.totalVolunteers}</Table.Td>
                  <Table.Td>{z.totalServed}</Table.Td>
                  <Table.Td>{z.lastEventDate ?? "—"}</Table.Td>
                  <Table.Td>
                    <Badge color={COVERAGE_COLOR[z.coverageLevel]} size="xs">
                      {COVERAGE_LABEL[z.coverageLevel]}
                    </Badge>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Paper>

      {/* Event Log */}
      <Paper withBorder p="md" radius="md">
        <Group mb="sm">
          <ThemeIcon color="green" variant="light" size="lg" radius="md">
            <Globe size={18} />
          </ThemeIcon>
          <Text fw={600}>Event Log</Text>
        </Group>
        {events.length === 0 ? (
          <Text size="sm" c="dimmed">No events recorded yet.</Text>
        ) : (
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Event</Table.Th>
                <Table.Th>Date</Table.Th>
                <Table.Th>Zone</Table.Th>
                <Table.Th>Volunteers</Table.Th>
                <Table.Th>Served</Table.Th>
                <Table.Th>Status</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {events.slice(0, 15).map((e) => (
                <Table.Tr key={e.id}>
                  <Table.Td>{e.name}</Table.Td>
                  <Table.Td>{e.eventDate}</Table.Td>
                  <Table.Td>{e.zoneName ?? "—"}</Table.Td>
                  <Table.Td>{e.volunteerCount}</Table.Td>
                  <Table.Td>{e.peopleServed}</Table.Td>
                  <Table.Td>
                    <Badge color={STATUS_COLOR[e.status] ?? "gray"} size="xs">{e.status}</Badge>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Paper>

      <Text size="xs" c="dimmed" fs="italic">{AI_ASSISTIVE_DISCLAIMER}</Text>
    </Stack>
  );
}
