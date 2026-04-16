"use client";

import { Badge, Group, Paper, SimpleGrid, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import { Globe, MapPin } from "lucide-react";

import type { MissionsTrackData } from "@/lib/ministry-forge-types";

const STATUS_COLOR: Record<string, string> = {
  planning: "yellow",
  confirmed: "blue",
  in_progress: "teal",
  completed: "gray",
  cancelled: "red",
};

const STATUS_LABELS: Record<string, string> = {
  planning: "Planning",
  confirmed: "Confirmed",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

const PARTNER_STATUS_COLOR: Record<string, string> = {
  active: "teal",
  inactive: "gray",
  prospective: "yellow",
};

function formatDate(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

export function MissionsTrackPanel({ data }: { data: MissionsTrackData }) {
  const totalHours = data.trips.filter((t) => t.status === "completed").reduce((sum, t) => sum + t.hoursServed, 0);
  const totalReached = data.trips.filter((t) => t.status === "completed").reduce((sum, t) => sum + t.peopleReached, 0);
  const completedTrips = data.trips.filter((t) => t.status === "completed").length;

  return (
    <Stack gap="lg">
      {/* Summary cards */}
      <SimpleGrid cols={{ base: 2, md: 4 }} spacing="md">
        <Paper withBorder radius="xl" p="lg" ta="center">
          <Text size="xs" tt="uppercase" fw={700} c="dimmed">Partners</Text>
          <Title order={3} mt="xs">{data.partners.filter((p) => p.relationshipStatus === "active").length}</Title>
        </Paper>
        <Paper withBorder radius="xl" p="lg" ta="center">
          <Text size="xs" tt="uppercase" fw={700} c="dimmed">Trips</Text>
          <Title order={3} mt="xs">{completedTrips}</Title>
        </Paper>
        <Paper withBorder radius="xl" p="lg" ta="center">
          <Text size="xs" tt="uppercase" fw={700} c="dimmed">Hours Served</Text>
          <Title order={3} mt="xs">{totalHours.toLocaleString()}</Title>
        </Paper>
        <Paper withBorder radius="xl" p="lg" ta="center">
          <Text size="xs" tt="uppercase" fw={700} c="dimmed">People Reached</Text>
          <Title order={3} mt="xs">{totalReached.toLocaleString()}</Title>
        </Paper>
      </SimpleGrid>

      {/* Mission partners */}
      <Paper withBorder radius="xl" p="xl">
        <Group gap="sm" mb="md">
          <ThemeIcon variant="light" color="teal" radius="xl" size="lg">
            <Globe size={18} />
          </ThemeIcon>
          <div>
            <Title order={4}>Mission Partners</Title>
            <Text size="sm" c="dimmed">Organizations the church partners with for global and local missions.</Text>
          </div>
        </Group>

        {data.partners.length ? (
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
            {data.partners.map((partner) => (
              <Paper key={partner.id} withBorder radius="lg" p="md" bg="#f8fafc">
                <Group justify="space-between" align="flex-start">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text fw={600} truncate>{partner.name}</Text>
                    {partner.region ? (
                      <Group gap={4} mt={4}>
                        <MapPin size={12} color="#94a3b8" />
                        <Text size="xs" c="dimmed">{partner.region}</Text>
                      </Group>
                    ) : null}
                    {partner.focusArea ? (
                      <Text size="xs" c="dimmed" mt={2}>{partner.focusArea}</Text>
                    ) : null}
                    {partner.contactName ? (
                      <Text size="xs" c="dimmed" mt={4}>Contact: {partner.contactName}</Text>
                    ) : null}
                  </div>
                  <Badge
                    color={PARTNER_STATUS_COLOR[partner.relationshipStatus] ?? "gray"}
                    variant="light"
                    size="sm"
                    radius="sm"
                  >
                    {partner.relationshipStatus}
                  </Badge>
                </Group>
              </Paper>
            ))}
          </SimpleGrid>
        ) : (
          <Text size="sm" c="dimmed">No mission partners yet. Add partner organizations to begin tracking global impact.</Text>
        )}
      </Paper>

      {/* Mission trips */}
      <Paper withBorder radius="xl" p="xl">
        <Group gap="sm" mb="md">
          <ThemeIcon variant="light" color="orange" radius="xl" size="lg">
            <MapPin size={18} />
          </ThemeIcon>
          <div>
            <Title order={4}>Mission Trips</Title>
            <Text size="sm" c="dimmed">Past and upcoming trips with roster, hours, and impact.</Text>
          </div>
        </Group>

        {data.trips.length ? (
          <Stack gap="sm">
            {data.trips.map((trip) => (
              <Paper key={trip.id} withBorder radius="lg" p="md" bg="#f8fafc">
                <Group justify="space-between" align="flex-start">
                  <div style={{ flex: 1 }}>
                    <Group gap="sm" align="center">
                      <Text fw={600}>{trip.name}</Text>
                      <Badge
                        color={STATUS_COLOR[trip.status] ?? "gray"}
                        variant="light"
                        size="xs"
                        radius="sm"
                      >
                        {STATUS_LABELS[trip.status] ?? trip.status}
                      </Badge>
                    </Group>
                    {trip.destination ? (
                      <Group gap={4} mt={4}>
                        <MapPin size={12} color="#94a3b8" />
                        <Text size="sm" c="dimmed">{trip.destination}</Text>
                      </Group>
                    ) : null}
                    {trip.departsAt ? (
                      <Text size="xs" c="dimmed" mt={2}>
                        {formatDate(trip.departsAt)}
                        {trip.returnsAt ? ` – ${formatDate(trip.returnsAt)}` : ""}
                      </Text>
                    ) : null}
                    {trip.partnerName ? (
                      <Text size="xs" c="dimmed" mt={2}>Partner: {trip.partnerName}</Text>
                    ) : null}
                    {trip.impactNotes ? (
                      <Text size="sm" mt={6}>{trip.impactNotes}</Text>
                    ) : null}
                  </div>
                  <Stack gap={4} align="flex-end">
                    <Badge color="churchBlue" variant="light" size="sm">
                      {trip.participantCount} participant{trip.participantCount !== 1 ? "s" : ""}
                    </Badge>
                    {trip.hoursServed > 0 ? (
                      <Badge color="teal" variant="light" size="xs">{trip.hoursServed.toLocaleString()} hrs</Badge>
                    ) : null}
                    {trip.peopleReached > 0 ? (
                      <Badge color="orange" variant="light" size="xs">{trip.peopleReached.toLocaleString()} reached</Badge>
                    ) : null}
                  </Stack>
                </Group>
              </Paper>
            ))}
          </Stack>
        ) : (
          <Text size="sm" c="dimmed">No mission trips yet. Log trips to track global engagement over time.</Text>
        )}
      </Paper>
    </Stack>
  );
}
