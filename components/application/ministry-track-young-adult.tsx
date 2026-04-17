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
import { Briefcase, Link2 } from "lucide-react";

import { AI_ASSISTIVE_DISCLAIMER } from "@/lib/ministry-forge-types";
import type { YoungAdultTrackData } from "@/lib/ministry-forge-types";

const STATUS_COLOR: Record<string, string> = {
  active: "green",
  completed: "blue",
  paused: "yellow",
  seeking: "orange",
};

export function YoungAdultTrackPanel({ data }: { data: YoungAdultTrackData }) {
  const { careerMentorships, seekingMentors } = data;

  const activePairs = careerMentorships.filter((m) => m.status === "active");
  const completedPairs = careerMentorships.filter((m) => m.status === "completed");
  const industries = [...new Set(careerMentorships.map((m) => m.industry).filter(Boolean))];

  return (
    <Stack gap="lg">
      {/* Summary Stats */}
      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
        <Paper withBorder p="md" radius="md">
          <Text size="xs" c="dimmed">Active Pairs</Text>
          <Text fw={700} size="xl" c="green">{activePairs.length}</Text>
        </Paper>
        <Paper withBorder p="md" radius="md">
          <Text size="xs" c="dimmed">Completed</Text>
          <Text fw={700} size="xl">{completedPairs.length}</Text>
        </Paper>
        <Paper withBorder p="md" radius="md">
          <Text size="xs" c="dimmed">Seeking Mentors</Text>
          <Text fw={700} size="xl" c="orange">{seekingMentors.length}</Text>
        </Paper>
        <Paper withBorder p="md" radius="md">
          <Text size="xs" c="dimmed">Industries Covered</Text>
          <Text fw={700} size="xl">{industries.length}</Text>
        </Paper>
      </SimpleGrid>

      {/* Career-Kingdom Mentorship Map */}
      <Paper withBorder p="md" radius="md">
        <Group mb="sm">
          <ThemeIcon color="teal" variant="light" size="lg" radius="md">
            <Link2 size={18} />
          </ThemeIcon>
          <div>
            <Text fw={600}>Career–Kingdom Mentorship Pairs</Text>
            <Text size="xs" c="dimmed">
              Connecting Young Adults with experienced mentors in the same professional field for
              faith-integrated career coaching.
            </Text>
          </div>
        </Group>

        {careerMentorships.length === 0 ? (
          <Text size="sm" c="dimmed">No mentorships recorded yet.</Text>
        ) : (
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Mentor</Table.Th>
                <Table.Th>Mentee</Table.Th>
                <Table.Th>Industry</Table.Th>
                <Table.Th>Focus</Table.Th>
                <Table.Th>Status</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {careerMentorships.map((m) => (
                <Table.Tr key={m.id}>
                  <Table.Td>{m.mentorName}</Table.Td>
                  <Table.Td>{m.menteeName}</Table.Td>
                  <Table.Td>{m.industry ?? "—"}</Table.Td>
                  <Table.Td>
                    <Text size="xs">{m.focusArea ?? "—"}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge color={STATUS_COLOR[m.status] ?? "gray"} size="xs">
                      {m.status}
                    </Badge>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Paper>

      {/* Seeking Mentors */}
      {seekingMentors.length > 0 && (
        <Paper withBorder p="md" radius="md">
          <Group mb="sm">
            <ThemeIcon color="orange" variant="light" size="lg" radius="md">
              <Briefcase size={18} />
            </ThemeIcon>
            <Text fw={600}>Seeking a Mentor</Text>
          </Group>
          <Table striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Young Adult</Table.Th>
                <Table.Th>Industry Interest</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {seekingMentors.map((s) => (
                <Table.Tr key={s.profileId}>
                  <Table.Td>{s.name}</Table.Td>
                  <Table.Td>{s.industry ?? "—"}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Paper>
      )}

      <Text size="xs" c="dimmed" fs="italic">{AI_ASSISTIVE_DISCLAIMER}</Text>
    </Stack>
  );
}
