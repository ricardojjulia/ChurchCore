"use client";

import Link from "next/link";
import {
  Alert,
  Badge,
  Button,
  Group,
  Paper,
  Progress,
  SimpleGrid,
  Stack,
  Table,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
import { AlertTriangle, CheckCircle, ExternalLink, ShieldAlert, ShieldCheck, Users } from "lucide-react";

import { AI_ASSISTIVE_DISCLAIMER } from "@/lib/ministry-forge-types";
import type { ChildrenTrackData } from "@/lib/ministry-forge-types";

function RatioStatusBadge({ status }: { status: "safe" | "warning" | "alert" }) {
  if (status === "alert") return <Badge color="red" leftSection={<AlertTriangle size={11} />}>Over Ratio</Badge>;
  if (status === "warning") return <Badge color="orange" leftSection={<AlertTriangle size={11} />}>Near Limit</Badge>;
  return <Badge color="green" leftSection={<CheckCircle size={11} />}>Safe</Badge>;
}

export function ChildrenTrackPanel({ data }: { data: ChildrenTrackData }) {
  const { rooms, recentCheckins, safetySnapshot, backgroundChecksDue } = data;

  const alertRooms = safetySnapshot.filter((r) => r.ratioStatus === "alert");

  // ── CCM Module link ──────────────────────────────────────────────────────
  const ccmModuleLink = (
    <Group justify="flex-end" mb="md">
      <Button
        component={Link}
        href="/app/church-admin/children"
        variant="light"
        color="churchBlue"
        size="sm"
        leftSection={<ShieldCheck size={14} />}
        rightSection={<ExternalLink size={12} />}
      >
        Open Full CCM Module
      </Button>
    </Group>
  );
  const warningRooms = safetySnapshot.filter((r) => r.ratioStatus === "warning");
  const overdueChecks = backgroundChecksDue.filter((p) => !p.clearanceDate);
  const expiringSoon = backgroundChecksDue.filter((p) => p.clearanceDate);

  return (
    <Stack gap="lg">
      {ccmModuleLink}

      {/* Safety Index Alert Banner */}
      {alertRooms.length > 0 && (
        <Alert
          color="red"
          icon={<ShieldAlert size={18} />}
          title="Safety Alert — Ratio Exceeded"
        >
          {alertRooms.map((r) => r.roomName).join(", ")} {alertRooms.length === 1 ? "is" : "are"}{" "}
          over the target child-to-leader ratio. Dispatch an emergency volunteer immediately.
        </Alert>
      )}
      {alertRooms.length === 0 && warningRooms.length > 0 && (
        <Alert color="orange" icon={<AlertTriangle size={18} />} title="Ratio Warning">
          {warningRooms.map((r) => r.roomName).join(", ")} approaching the ratio limit.
          Consider moving a volunteer proactively.
        </Alert>
      )}

      {/* Safety Index — Room Ratios */}
      <Paper withBorder p="md" radius="md">
        <Group mb="sm">
          <ThemeIcon color="blue" variant="light" size="lg" radius="md">
            <ShieldCheck size={18} />
          </ThemeIcon>
          <div>
            <Text fw={600}>Safety Index — Live Ratios</Text>
            <Text size="xs" c="dimmed">Target: ≤ ratio children per leader per room</Text>
          </div>
        </Group>

        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="sm">
          {safetySnapshot.map((room) => {
            const fillPct = room.targetRatio > 0
              ? Math.min(100, (room.actualRatio / room.targetRatio) * 100)
              : 0;
            return (
              <Paper key={room.roomId} withBorder p="sm" radius="sm">
                <Group justify="space-between" mb={4}>
                  <Text fw={500} size="sm">{room.roomName}</Text>
                  <RatioStatusBadge status={room.ratioStatus} />
                </Group>
                <Group gap="xs" mb={6}>
                  <Users size={13} />
                  <Text size="xs" c="dimmed">
                    {room.currentChildren} children / {room.currentLeaders} leaders
                    {" "}(ratio {room.actualRatio}:{room.targetRatio})
                  </Text>
                </Group>
                <Progress
                  value={fillPct}
                  color={room.ratioStatus === "alert" ? "red" : room.ratioStatus === "warning" ? "orange" : "green"}
                  size="sm"
                  radius="xl"
                />
                <Text size="xs" c="dimmed" mt={2}>Capacity: {room.capacity}</Text>
              </Paper>
            );
          })}
          {rooms.length === 0 && (
            <Text size="sm" c="dimmed">No classrooms configured. Add rooms to enable safety monitoring.</Text>
          )}
        </SimpleGrid>
      </Paper>

      {/* Background Checks Due */}
      {backgroundChecksDue.length > 0 && (
        <Paper withBorder p="md" radius="md">
          <Text fw={600} mb="sm">Background Check Status</Text>
          <Table striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Leader</Table.Th>
                <Table.Th>Clearance Date</Table.Th>
                <Table.Th>Status</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {overdueChecks.map((p) => (
                <Table.Tr key={p.profileId}>
                  <Table.Td>{p.name}</Table.Td>
                  <Table.Td>—</Table.Td>
                  <Table.Td><Badge color="red" size="xs">No record on file</Badge></Table.Td>
                </Table.Tr>
              ))}
              {expiringSoon.map((p) => (
                <Table.Tr key={p.profileId}>
                  <Table.Td>{p.name}</Table.Td>
                  <Table.Td>{p.clearanceDate}</Table.Td>
                  <Table.Td><Badge color="orange" size="xs">Expiring within 30 days</Badge></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Paper>
      )}

      {/* Recent Check-ins */}
      <Paper withBorder p="md" radius="md">
        <Title order={5} mb="sm">Recent Check-ins</Title>
        {recentCheckins.length === 0 ? (
          <Text size="sm" c="dimmed">No check-ins recorded yet.</Text>
        ) : (
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Child</Table.Th>
                <Table.Th>Room</Table.Th>
                <Table.Th>Guardian</Table.Th>
                <Table.Th>Service Date</Table.Th>
                <Table.Th>Status</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {recentCheckins.slice(0, 15).map((c) => (
                <Table.Tr key={c.id}>
                  <Table.Td>{c.childName}</Table.Td>
                  <Table.Td>{c.roomName}</Table.Td>
                  <Table.Td>{c.guardianName ?? "—"}</Table.Td>
                  <Table.Td>{c.serviceDate}</Table.Td>
                  <Table.Td>
                    {c.checkedOutAt
                      ? <Badge color="gray" size="xs">Checked out</Badge>
                      : <Badge color="green" size="xs">Present</Badge>}
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
