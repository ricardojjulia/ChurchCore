"use client";

import {
  Badge,
  Group,
  Paper,
  Progress,
  SimpleGrid,
  Stack,
  Table,
  Text,
  ThemeIcon,
} from "@mantine/core";
import { BookOpen, Map } from "lucide-react";

import { AI_ASSISTIVE_DISCLAIMER } from "@/lib/ministry-forge-types";
import type { EducationTrackData } from "@/lib/ministry-forge-types";

const AREA_LABELS: Record<string, string> = {
  theology: "Theology",
  bible_survey: "Bible Survey",
  spiritual_disciplines: "Spiritual Disciplines",
  church_history: "Church History",
  apologetics: "Apologetics",
  leadership: "Leadership",
  marriage_family: "Marriage & Family",
  missions: "Missions",
  finance: "Stewardship & Finance",
  other: "Other",
};

const AREA_COLOR: Record<string, string> = {
  theology: "blue",
  bible_survey: "indigo",
  spiritual_disciplines: "violet",
  church_history: "cyan",
  apologetics: "teal",
  leadership: "green",
  marriage_family: "pink",
  missions: "orange",
  finance: "yellow",
  other: "gray",
};

export function EducationTrackPanel({ data }: { data: EducationTrackData }) {
  const { courses, memberProgress } = data;

  const activeCourses = courses.filter((c) => c.isActive);
  const totalEnrollments = courses.reduce((s, c) => s + c.enrolledCount, 0);
  const totalCompletions = courses.reduce((s, c) => s + c.completedCount, 0);
  const areaSet = [...new Set(courses.map((c) => c.curriculumArea))];

  return (
    <Stack gap="lg">
      {/* Summary */}
      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
        <Paper withBorder p="md" radius="md">
          <Text size="xs" c="dimmed">Active Courses</Text>
          <Text fw={700} size="xl">{activeCourses.length}</Text>
        </Paper>
        <Paper withBorder p="md" radius="md">
          <Text size="xs" c="dimmed">Curriculum Areas</Text>
          <Text fw={700} size="xl">{areaSet.length}</Text>
        </Paper>
        <Paper withBorder p="md" radius="md">
          <Text size="xs" c="dimmed">Enrollments</Text>
          <Text fw={700} size="xl">{totalEnrollments}</Text>
        </Paper>
        <Paper withBorder p="md" radius="md">
          <Text size="xs" c="dimmed">Completions</Text>
          <Text fw={700} size="xl" c="green">{totalCompletions}</Text>
        </Paper>
      </SimpleGrid>

      {/* Course Catalog */}
      <Paper withBorder p="md" radius="md">
        <Group mb="sm">
          <ThemeIcon color="indigo" variant="light" size="lg" radius="md">
            <BookOpen size={18} />
          </ThemeIcon>
          <div>
            <Text fw={600}>Course Catalog</Text>
            <Text size="xs" c="dimmed">Core doctrinal curriculum mapped to theological areas.</Text>
          </div>
        </Group>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Course</Table.Th>
              <Table.Th>Area</Table.Th>
              <Table.Th>Weeks</Table.Th>
              <Table.Th>Enrolled</Table.Th>
              <Table.Th>Completed</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {courses.map((c) => (
              <Table.Tr key={c.id}>
                <Table.Td>
                  <Text size="sm" fw={500}>{c.title}</Text>
                  {c.description && <Text size="xs" c="dimmed" lineClamp={1}>{c.description}</Text>}
                </Table.Td>
                <Table.Td>
                  <Badge color={AREA_COLOR[c.curriculumArea] ?? "gray"} size="xs">
                    {AREA_LABELS[c.curriculumArea] ?? c.curriculumArea}
                  </Badge>
                </Table.Td>
                <Table.Td>{c.durationWeeks ?? "—"}</Table.Td>
                <Table.Td>{c.enrolledCount}</Table.Td>
                <Table.Td>
                  <Badge color={c.completedCount > 0 ? "green" : "gray"} size="xs">
                    {c.completedCount}
                  </Badge>
                </Table.Td>
              </Table.Tr>
            ))}
            {courses.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={5}>
                  <Text size="sm" c="dimmed">No courses added yet.</Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Paper>

      {/* Doctrinal Blueprint — per-member coverage */}
      <Paper withBorder p="md" radius="md">
        <Group mb="sm">
          <ThemeIcon color="violet" variant="light" size="lg" radius="md">
            <Map size={18} />
          </ThemeIcon>
          <div>
            <Text fw={600}>Doctrinal Blueprint</Text>
            <Text size="xs" c="dimmed">
              Each member&apos;s theological coverage across the church&apos;s core curriculum areas.
            </Text>
          </div>
        </Group>
        {memberProgress.length === 0 ? (
          <Text size="sm" c="dimmed">No enrollments yet.</Text>
        ) : (
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Member</Table.Th>
                <Table.Th>Coverage</Table.Th>
                <Table.Th>Areas Completed</Table.Th>
                <Table.Th>Courses</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {memberProgress
                .sort((a, b) => b.coveragePercent - a.coveragePercent)
                .map((p) => (
                  <Table.Tr key={p.profileId}>
                    <Table.Td>{p.name}</Table.Td>
                    <Table.Td style={{ minWidth: 140 }}>
                      <Progress
                        value={p.coveragePercent}
                        color={p.coveragePercent >= 80 ? "green" : p.coveragePercent >= 40 ? "yellow" : "red"}
                        size="sm"
                        radius="xl"
                      />
                      <Text size="xs" c="dimmed">{p.coveragePercent}%</Text>
                    </Table.Td>
                    <Table.Td>
                      <Group gap={4} wrap="wrap">
                        {p.completedAreas.map((area) => (
                          <Badge key={area} color={AREA_COLOR[area] ?? "gray"} size="xs" variant="light">
                            {AREA_LABELS[area] ?? area}
                          </Badge>
                        ))}
                        {p.completedAreas.length === 0 && <Text size="xs" c="dimmed">None yet</Text>}
                      </Group>
                    </Table.Td>
                    <Table.Td>{p.completedCount} / {p.totalCourses}</Table.Td>
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
