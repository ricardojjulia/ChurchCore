"use client";

import { Badge, Group, Paper, SimpleGrid, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import { ArrowRight, Users } from "lucide-react";

import type { MensTrackData } from "@/lib/ministry-forge-types";

const STATUS_COLOR: Record<string, string> = {
  active: "teal",
  completed: "gray",
  paused: "yellow",
  seeking: "blue",
};

export function MensMinistryPanel({ data }: { data: MensTrackData }) {
  return (
    <Stack gap="lg">
      {/* Mentorship map */}
      <Paper withBorder radius="xl" p="xl">
        <Group gap="sm" mb="md">
          <ThemeIcon variant="light" color="churchBlue" radius="xl" size="lg">
            <ArrowRight size={18} />
          </ThemeIcon>
          <div>
            <Title order={4}>Mentorship Map</Title>
            <Text size="sm" c="dimmed">Active mentor–mentee relationships and pairing status.</Text>
          </div>
        </Group>

        {data.mentorshipPairs.length ? (
          <Stack gap="sm">
            {data.mentorshipPairs.map((pair) => (
              <Paper key={pair.id} withBorder radius="lg" p="md" bg="#f8fafc">
                <Group justify="space-between" align="center">
                  <Group gap="sm">
                    <Text fw={600}>{pair.mentorName}</Text>
                    <ArrowRight size={14} color="#94a3b8" />
                    <Text fw={600}>{pair.menteeName}</Text>
                  </Group>
                  <Badge
                    color={STATUS_COLOR[pair.status] ?? "gray"}
                    variant="light"
                    radius="sm"
                    size="sm"
                  >
                    {pair.status}
                  </Badge>
                </Group>
                {pair.startedAt ? (
                  <Text size="xs" c="dimmed" mt={4}>
                    Started{" "}
                    {new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(new Date(pair.startedAt))}
                  </Text>
                ) : null}
              </Paper>
            ))}
          </Stack>
        ) : (
          <Text size="sm" c="dimmed">No mentorship pairs yet. Pair men to begin tracking discipleship relationships.</Text>
        )}
      </Paper>

      {/* Discipleship groups */}
      <Paper withBorder radius="xl" p="xl">
        <Group gap="sm" mb="md">
          <ThemeIcon variant="light" color="blue" radius="xl" size="lg">
            <Users size={18} />
          </ThemeIcon>
          <div>
            <Title order={4}>Discipleship Groups</Title>
            <Text size="sm" c="dimmed">Small group assignments, leaders, and cadence.</Text>
          </div>
        </Group>

        {data.discipleshipGroups.length ? (
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
            {data.discipleshipGroups.map((group) => (
              <Paper key={group.id} withBorder radius="lg" p="md" bg="#f8fafc">
                <Group justify="space-between" align="flex-start">
                  <div>
                    <Text fw={600}>{group.name}</Text>
                    {group.leaderName ? (
                      <Text size="sm" c="dimmed" mt={2}>Led by {group.leaderName}</Text>
                    ) : null}
                    {group.cadence ? (
                      <Text size="xs" c="dimmed" mt={4}>{group.cadence}</Text>
                    ) : null}
                  </div>
                  <Stack gap={4} align="flex-end">
                    <Badge color="churchBlue" variant="light" size="sm">{group.memberCount} members</Badge>
                    <Badge color={group.isOpen ? "teal" : "gray"} variant="light" size="xs">
                      {group.isOpen ? "Open" : "Closed"}
                    </Badge>
                  </Stack>
                </Group>
              </Paper>
            ))}
          </SimpleGrid>
        ) : (
          <Text size="sm" c="dimmed">No discipleship groups yet. Create a group to begin tracking brotherhood community.</Text>
        )}
      </Paper>
    </Stack>
  );
}
