"use client";

import {
  Badge,
  Group,
  Paper,
  Progress,
  Stack,
  Table,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
import { GraduationCap, ListChecks } from "lucide-react";

import { AI_ASSISTIVE_DISCLAIMER } from "@/lib/ministry-forge-types";
import type { YouthTrackData } from "@/lib/ministry-forge-types";

function AlertBadge({ level }: { level: "on_track" | "at_risk" | "critical" }) {
  if (level === "critical") return <Badge color="red" size="xs">Critical — Act Now</Badge>;
  if (level === "at_risk") return <Badge color="orange" size="xs">At Risk</Badge>;
  return <Badge color="green" size="xs">On Track</Badge>;
}

export function YouthTrackPanel({ data }: { data: YouthTrackData }) {
  const { milestones, students } = data;

  const criticalCount = students.filter((s) => s.alertLevel === "critical").length;
  const atRiskCount = students.filter((s) => s.alertLevel === "at_risk").length;
  const requiredMilestones = milestones.filter((m) => m.isRequired);

  return (
    <Stack gap="lg">
      {/* Summary */}
      <Group gap="md">
        <Paper withBorder p="md" radius="md" style={{ flex: 1, minWidth: 140 }}>
          <Text size="xs" c="dimmed">Total Students</Text>
          <Text fw={700} size="xl">{students.length}</Text>
        </Paper>
        <Paper withBorder p="md" radius="md" style={{ flex: 1, minWidth: 140 }}>
          <Text size="xs" c="dimmed">Required Milestones</Text>
          <Text fw={700} size="xl">{requiredMilestones.length}</Text>
        </Paper>
        <Paper withBorder p="md" radius="md" style={{ flex: 1, minWidth: 140 }}>
          <Text size="xs" c="orange.7">At Risk</Text>
          <Text fw={700} size="xl" c="orange">{atRiskCount}</Text>
        </Paper>
        <Paper withBorder p="md" radius="md" style={{ flex: 1, minWidth: 140 }}>
          <Text size="xs" c="red.7">Critical</Text>
          <Text fw={700} size="xl" c="red">{criticalCount}</Text>
        </Paper>
      </Group>

      {/* Graduation Readiness Table */}
      <Paper withBorder p="md" radius="md">
        <Group mb="sm">
          <ThemeIcon color="indigo" variant="light" size="lg" radius="md">
            <GraduationCap size={18} />
          </ThemeIcon>
          <div>
            <Text fw={600}>Graduation Readiness Tracker</Text>
            <Text size="xs" c="dimmed">
              Students missing required Next Step milestones before graduation are flagged.
            </Text>
          </div>
        </Group>

        {students.length === 0 ? (
          <Text size="sm" c="dimmed">No students enrolled. Add milestones and assign students to begin tracking.</Text>
        ) : (
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Student</Table.Th>
                <Table.Th>Grad Year</Table.Th>
                <Table.Th>Progress</Table.Th>
                <Table.Th>Completed</Table.Th>
                <Table.Th>Alert</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {students
                .sort((a, b) => {
                  const order = { critical: 0, at_risk: 1, on_track: 2 };
                  return order[a.alertLevel] - order[b.alertLevel];
                })
                .map((s) => (
                  <Table.Tr key={s.profileId}>
                    <Table.Td>{s.name}</Table.Td>
                    <Table.Td>{s.graduationYear ?? "—"}</Table.Td>
                    <Table.Td style={{ minWidth: 140 }}>
                      <Progress
                        value={s.readinessPercent}
                        color={s.alertLevel === "critical" ? "red" : s.alertLevel === "at_risk" ? "orange" : "green"}
                        size="sm"
                        radius="xl"
                      />
                      <Text size="xs" c="dimmed">{s.readinessPercent}%</Text>
                    </Table.Td>
                    <Table.Td>
                      {s.completedCount} / {s.totalRequired} required
                    </Table.Td>
                    <Table.Td><AlertBadge level={s.alertLevel} /></Table.Td>
                  </Table.Tr>
                ))}
            </Table.Tbody>
          </Table>
        )}
      </Paper>

      {/* Milestone Catalog */}
      <Paper withBorder p="md" radius="md">
        <Group mb="sm">
          <ThemeIcon color="violet" variant="light" size="lg" radius="md">
            <ListChecks size={18} />
          </ThemeIcon>
          <Title order={5}>Next Step Milestones</Title>
        </Group>
        <Table striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>#</Table.Th>
              <Table.Th>Milestone</Table.Th>
              <Table.Th>Required</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {milestones.map((m, i) => (
              <Table.Tr key={m.id}>
                <Table.Td>{i + 1}</Table.Td>
                <Table.Td>
                  <Text size="sm" fw={500}>{m.name}</Text>
                  {m.description && <Text size="xs" c="dimmed">{m.description}</Text>}
                </Table.Td>
                <Table.Td>
                  {m.isRequired
                    ? <Badge color="blue" size="xs">Required</Badge>
                    : <Badge color="gray" size="xs">Optional</Badge>}
                </Table.Td>
              </Table.Tr>
            ))}
            {milestones.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={3}>
                  <Text size="sm" c="dimmed">No milestones defined yet.</Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Paper>

      <Text size="xs" c="dimmed" fs="italic">{AI_ASSISTIVE_DISCLAIMER}</Text>
    </Stack>
  );
}
