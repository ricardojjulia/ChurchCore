"use client";

import Link from "next/link";
import { Badge, Button, Group, Paper, Stack, Text, ThemeIcon } from "@mantine/core";
import { BookOpen, MessageSquare } from "lucide-react";

import type { DiscernmentSession } from "@/lib/elders-types";
import {
  SESSION_STATUS_COLOR,
  SESSION_STATUS_LABEL,
} from "@/lib/elders-types";

function formatDate(value: string | null): string {
  if (!value) return "Date TBD";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function DiscernmentSessionCard({
  session,
}: {
  session: DiscernmentSession;
}) {
  return (
    <Paper withBorder p="lg" radius="lg">
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Group gap="sm" align="flex-start" style={{ flex: 1 }}>
            <ThemeIcon
              variant="light"
              color={SESSION_STATUS_COLOR[session.status]}
              size="md"
              radius="xl"
            >
              <BookOpen size={15} />
            </ThemeIcon>
            <Stack gap={2} style={{ flex: 1 }}>
              <Text fw={600} fz="sm" lh={1.3}>
                {session.title}
              </Text>
              <Text fz="xs" c="dimmed">
                {formatDate(session.date)}
              </Text>
            </Stack>
          </Group>

          <Badge
            color={SESSION_STATUS_COLOR[session.status]}
            variant="light"
            size="sm"
            radius="xl"
          >
            {SESSION_STATUS_LABEL[session.status]}
          </Badge>
        </Group>

        {session.description ? (
          <Text fz="sm" c="dimmed" lineClamp={2}>
            {session.description}
          </Text>
        ) : null}

        <Group justify="space-between" align="center">
          <Group gap="xs">
            <MessageSquare size={13} color="var(--mantine-color-dimmed)" />
            <Text fz="xs" c="dimmed">
              {session.prayerRequestCount} prayer{" "}
              {session.prayerRequestCount === 1 ? "request" : "requests"}
            </Text>
          </Group>

          <Button
            component={Link}
            href={`/app/elders/discernment/${session.id}`}
            size="xs"
            variant="light"
            radius="xl"
          >
            Enter room
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}
