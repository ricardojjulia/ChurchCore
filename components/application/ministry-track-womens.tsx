"use client";

import { Badge, Group, Paper, SimpleGrid, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import { Heart, Users } from "lucide-react";

import type { WomensTrackData } from "@/lib/ministry-forge-types";

const LIFE_STAGE_LABELS: Record<string, string> = {
  new_mom: "New Mom",
  young_woman: "Young Woman",
  single_woman: "Single Woman",
  married: "Married",
  empty_nester: "Empty Nester",
  widow: "Widow",
  senior: "Senior",
  general: "General",
};

const STATUS_COLOR: Record<string, string> = {
  active: "teal",
  completed: "gray",
  pending: "yellow",
};

export function WomensMinistryPanel({ data }: { data: WomensTrackData }) {
  return (
    <Stack gap="lg">
      {/* Life-stage circles */}
      <Paper withBorder radius="xl" p="xl">
        <Group gap="sm" mb="md">
          <ThemeIcon variant="light" color="pink" radius="xl" size="lg">
            <Users size={18} />
          </ThemeIcon>
          <div>
            <Title order={4}>Life-Stage Circles</Title>
            <Text size="sm" c="dimmed">Women grouped by life season for mutual support and study.</Text>
          </div>
        </Group>

        {data.lifeStageCircles.length ? (
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
            {data.lifeStageCircles.map((circle) => (
              <Paper key={circle.id} withBorder radius="lg" p="md" bg="#f8fafc">
                <Group justify="space-between" align="flex-start">
                  <div>
                    <Text fw={600}>{circle.name}</Text>
                    <Badge size="xs" color="pink" variant="light" mt={4}>
                      {LIFE_STAGE_LABELS[circle.lifeStage] ?? circle.lifeStage}
                    </Badge>
                    {circle.leaderName ? (
                      <Text size="sm" c="dimmed" mt={4}>Led by {circle.leaderName}</Text>
                    ) : null}
                    {circle.meetingCadence ? (
                      <Text size="xs" c="dimmed" mt={2}>{circle.meetingCadence}</Text>
                    ) : null}
                  </div>
                  <Badge color="churchBlue" variant="light" size="sm">
                    {circle.memberCount} members
                  </Badge>
                </Group>
              </Paper>
            ))}
          </SimpleGrid>
        ) : (
          <Text size="sm" c="dimmed">No life-stage circles yet. Create circles to connect women by season of life.</Text>
        )}
      </Paper>

      {/* Support pairings */}
      <Paper withBorder radius="xl" p="xl">
        <Group gap="sm" mb="md">
          <ThemeIcon variant="light" color="rose" radius="xl" size="lg">
            <Heart size={18} />
          </ThemeIcon>
          <div>
            <Title order={4}>Support Pairings</Title>
            <Text size="sm" c="dimmed">Interest-aware and season-aware one-to-one support connections.</Text>
          </div>
        </Group>

        {data.supportPairings.length ? (
          <Stack gap="sm">
            {data.supportPairings.map((pairing) => (
              <Paper key={pairing.id} withBorder radius="lg" p="md" bg="#f8fafc">
                <Group justify="space-between" align="center">
                  <div>
                    <Group gap="xs">
                      <Text fw={600}>{pairing.supporterName}</Text>
                      <Text size="sm" c="dimmed">→</Text>
                      <Text fw={600}>{pairing.supportedName}</Text>
                    </Group>
                    {pairing.pairingReason ? (
                      <Text size="xs" c="dimmed" mt={4}>{pairing.pairingReason}</Text>
                    ) : null}
                  </div>
                  <Badge
                    color={STATUS_COLOR[pairing.status] ?? "gray"}
                    variant="light"
                    size="sm"
                    radius="sm"
                  >
                    {pairing.status}
                  </Badge>
                </Group>
              </Paper>
            ))}
          </Stack>
        ) : (
          <Text size="sm" c="dimmed">No support pairings yet. Connect women who can encourage one another.</Text>
        )}
      </Paper>
    </Stack>
  );
}
