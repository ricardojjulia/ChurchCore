"use client";

import {
  Badge,
  Group,
  Paper,
  Progress,
  Stack,
  Text,
  ThemeIcon,
} from "@mantine/core";
import { ShieldAlert, ShieldCheck, Users } from "lucide-react";

import type { CcmRoomStatus } from "@/lib/ccm-types";

export function CcmRoomCard({ status }: { status: CcmRoomStatus }) {
  const { room, childCount, volunteerCount, actualRatio, ratioStatus, twoAdultRuleMet } = status;

  const fillPct = room.targetRatio > 0
    ? Math.min(100, (actualRatio / room.targetRatio) * 100)
    : 0;

  const ratioColor =
    ratioStatus === "alert" ? "red" : ratioStatus === "warning" ? "orange" : "teal";

  const ageLabel =
    room.ageMin !== null && room.ageMax !== null
      ? `Ages ${room.ageMin}–${room.ageMax}`
      : room.ageMin !== null
        ? `Age ${room.ageMin}+`
        : null;

  return (
    <Paper withBorder p="md" radius="md">
      <Group justify="space-between" align="flex-start" mb="xs">
        <div>
          <Text fw={700} size="sm">{room.name}</Text>
          {ageLabel && <Text size="xs" c="dimmed">{ageLabel}</Text>}
        </div>
        <Group gap={4}>
          {!twoAdultRuleMet && (
            <Badge
              color="red"
              variant="filled"
              size="xs"
              leftSection={<ShieldAlert size={10} />}
            >
              Two-adult rule
            </Badge>
          )}
          <Badge
            color={ratioColor}
            variant={ratioStatus === "safe" ? "light" : "filled"}
            size="sm"
          >
            {ratioStatus === "alert"
              ? "Over ratio"
              : ratioStatus === "warning"
                ? "Near limit"
                : "Safe"}
          </Badge>
        </Group>
      </Group>

      <Group gap="xl" mb="xs">
        <Stack gap={0} align="center">
          <Text fw={700} size="xl">{childCount}</Text>
          <Text size="xs" c="dimmed">Children</Text>
        </Stack>
        <Stack gap={0} align="center">
          <Text fw={700} size="xl">{volunteerCount}</Text>
          <Text size="xs" c="dimmed">Volunteers</Text>
        </Stack>
        <Stack gap={0} align="center">
          <Group gap={4}>
            <Text fw={700} size="lg">{actualRatio}</Text>
            <Text size="xs" c="dimmed">/ {room.targetRatio}</Text>
          </Group>
          <Text size="xs" c="dimmed">Ratio</Text>
        </Stack>
      </Group>

      <Progress
        value={fillPct}
        color={ratioColor}
        size="md"
        radius="xl"
        mb={4}
      />
      <Text size="xs" c="dimmed">
        Capacity: {room.capacity} · Target ratio: 1:{room.targetRatio}
      </Text>

      {twoAdultRuleMet ? (
        <Group gap={4} mt="xs">
          <ThemeIcon color="teal" variant="light" size="xs" radius="xl">
            <ShieldCheck size={10} />
          </ThemeIcon>
          <Text size="xs" c="teal.7">Two-adult rule met</Text>
        </Group>
      ) : (
        <Group gap={4} mt="xs">
          <ThemeIcon color="red" variant="light" size="xs" radius="xl">
            <ShieldAlert size={10} />
          </ThemeIcon>
          <Text size="xs" c="red.7">
            Two-adult rule NOT met — {volunteerCount} volunteer{volunteerCount !== 1 ? "s" : ""} confirmed
          </Text>
        </Group>
      )}

      {/* Volunteer chips */}
      {status.confirmedVolunteers.length > 0 && (
        <Group gap={4} mt="xs">
          <Users size={12} />
          {status.confirmedVolunteers.map((v) => (
            <Badge
              key={v.id}
              size="xs"
              color={v.clearanceExpiringSoon ? "orange" : "gray"}
              variant="outline"
            >
              {v.volunteerName.split(" ")[0]}
            </Badge>
          ))}
        </Group>
      )}
    </Paper>
  );
}
