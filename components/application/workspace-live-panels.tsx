"use client";

import { useMemo, useState } from "react";
import { Bot, CalendarClock, ShieldAlert, Sparkles } from "lucide-react";
import {
  Badge,
  Group,
  Paper,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";

import type {
  PortalActionItem,
  PortalAiItem,
  PortalAlert,
  PortalTimelineItem,
} from "@/lib/portal";

type WorkspaceMode = "timeline" | "watchlist" | "ai";

const levelMeta = {
  healthy: { color: "teal", label: "Healthy" },
  warning: { color: "yellow", label: "Warning" },
  critical: { color: "red", label: "Critical" },
} as const;

const statusMeta = {
  today: { color: "teal", label: "Today" },
  soon: { color: "yellow", label: "Soon" },
  watch: { color: "gray", label: "Watch" },
} as const;

export function WorkspaceLivePanels({
  timeline,
  watchlist,
  aiQueue,
  actionBoard,
}: {
  timeline: PortalTimelineItem[];
  watchlist: PortalAlert[];
  aiQueue: PortalAiItem[];
  actionBoard: PortalActionItem[];
}) {
  const [mode, setMode] = useState<WorkspaceMode>("timeline");

  const content = useMemo(() => {
    if (mode === "timeline") {
      return timeline.map((item) => (
        <Paper key={`${item.time}-${item.title}`} withBorder radius="xl" p="lg">
          <Group justify="space-between" align="flex-start" gap="md">
            <div>
              <Text fw={600}>{item.title}</Text>
              <Text c="dimmed" size="sm" mt={6}>
                {item.detail}
              </Text>
            </div>
            <Stack gap={6} align="flex-end">
              <Badge color={statusMeta[item.status].color} variant="light">
                {statusMeta[item.status].label}
              </Badge>
              <Text size="sm" fw={600}>
                {item.time}
              </Text>
            </Stack>
          </Group>
        </Paper>
      ));
    }

    if (mode === "watchlist") {
      return watchlist.map((item) => (
        <Paper key={item.title} withBorder radius="xl" p="lg">
          <Group gap="sm" mb="sm">
            <Badge color={levelMeta[item.level].color} variant="light">
              {levelMeta[item.level].label}
            </Badge>
          </Group>
          <Text fw={600}>{item.title}</Text>
          <Text c="dimmed" size="sm" mt={6}>
            {item.detail}
          </Text>
        </Paper>
      ));
    }

    return aiQueue.map((item) => (
      <Paper key={item.title} withBorder radius="xl" p="lg">
        <Group justify="space-between" mb="sm">
          <Text fw={600}>{item.title}</Text>
          <Badge color="teal" variant="light">
            Review
          </Badge>
        </Group>
        <Text c="dimmed" size="sm">
          {item.detail}
        </Text>
        <Text mt="md" size="xs" fw={700} tt="uppercase" c="teal">
          {item.guardrail}
        </Text>
      </Paper>
    ));
  }, [aiQueue, mode, timeline, watchlist]);

  const modeIcon =
    mode === "timeline" ? CalendarClock : mode === "watchlist" ? ShieldAlert : Bot;

  return (
    <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="lg">
      <Paper withBorder radius="xl" p="xl">
        <Group justify="space-between" mb="lg" align="flex-start">
          <Group gap="sm">
            <ThemeIcon color="teal" variant="light" radius="xl" size="lg">
              {(() => {
                const Icon = modeIcon;
                return <Icon size={18} />;
              })()}
            </ThemeIcon>
            <div>
              <Title order={3} size="h4">
                {mode === "timeline"
                  ? "Live execution queue"
                  : mode === "watchlist"
                    ? "Risk pressure board"
                    : "Assistive draft queue"}
              </Title>
              <Text c="dimmed" size="sm" mt={4}>
                {mode === "timeline"
                  ? "Show only what needs attention now."
                  : mode === "watchlist"
                    ? "Keep active pressure visible until it changes."
                    : "AI stays in a narrow, review-first lane."}
              </Text>
            </div>
          </Group>

          <SegmentedControl
            value={mode}
            onChange={(value) => setMode(value as WorkspaceMode)}
            data={[
              { label: "Today", value: "timeline" },
              { label: "Risks", value: "watchlist" },
              { label: "AI", value: "ai" },
            ]}
          />
        </Group>

        <Stack gap="md">{content}</Stack>
      </Paper>

      <Paper
        radius="xl"
        p="xl"
        style={{ background: "#0f172a", color: "white" }}
      >
        <Group gap="sm" mb="lg">
          <ThemeIcon color="teal" variant="light" radius="xl" size="lg">
            <Sparkles size={18} />
          </ThemeIcon>
          <div>
            <Title order={3} size="h4" c="white">
              Priority sequence
            </Title>
            <Text c="gray.4" size="sm" mt={4}>
              The most useful next moves, in order.
            </Text>
          </div>
        </Group>

        <Stack gap="sm">
          {actionBoard.map((item, index) => (
            <Paper
              key={item.title}
              radius="xl"
              p="md"
              bg="rgba(255,255,255,0.05)"
              style={{ border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <Group align="flex-start" gap="sm" wrap="nowrap">
                <ThemeIcon color="teal" variant="light" radius="xl">
                  <Text fw={700} size="xs">
                    {index + 1}
                  </Text>
                </ThemeIcon>
                <div>
                  <Text fw={600} c="white">
                    {item.title}
                  </Text>
                  <Text c="gray.4" size="sm" mt={4}>
                    {item.detail}
                  </Text>
                </div>
              </Group>
            </Paper>
          ))}
        </Stack>
      </Paper>
    </SimpleGrid>
  );
}
