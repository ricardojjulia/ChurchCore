"use client";

import {
  Badge,
  Group,
  Paper,
  RingProgress,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";

import type { HealthHistoryEntry, MinistryHealthBand } from "@/lib/ministry-forge-types";
import { healthBand } from "@/lib/ministry-forge-types";

const BAND_COLOR: Record<MinistryHealthBand, string> = {
  green: "teal",
  yellow: "yellow",
  red: "red",
};

const BAND_LABEL: Record<MinistryHealthBand, string> = {
  green: "Healthy",
  yellow: "Needs attention",
  red: "At risk",
};

function trendArrow(history: HealthHistoryEntry[]) {
  if (history.length < 2) return null;
  const recent = history[0].healthScore;
  const prior = history[Math.min(2, history.length - 1)].healthScore;
  const delta = recent - prior;
  if (delta > 0.2) return { icon: TrendingUp, color: "teal", label: `+${delta.toFixed(1)}` };
  if (delta < -0.2) return { icon: TrendingDown, color: "red", label: delta.toFixed(1) };
  return { icon: Minus, color: "gray", label: "Stable" };
}

export function HealthScoreCard({
  healthScore,
  lastHealthAssessment,
  healthHistory,
}: {
  healthScore: number;
  lastHealthAssessment: string | null;
  healthHistory: HealthHistoryEntry[];
}) {
  const band = healthBand(healthScore);
  const color = BAND_COLOR[band];
  const ringValue = Math.round((healthScore / 10) * 100);
  const trend = trendArrow(healthHistory);
  const TrendIcon = trend?.icon;

  const lastAssessed = lastHealthAssessment
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(new Date(lastHealthAssessment))
    : null;

  return (
    <Paper withBorder radius="xl" p="xl">
      <Group justify="space-between" align="flex-start" gap="lg">
        <Stack gap="xs" style={{ flex: 1 }}>
          <Text size="xs" tt="uppercase" fw={700} c="dimmed">
            Ministry Health Score
          </Text>

          <Group gap="sm" align="baseline">
            <Title order={2} style={{ fontSize: "2.5rem", lineHeight: 1 }}>
              {healthScore.toFixed(1)}
            </Title>
            <Text size="lg" c="dimmed">
              / 10
            </Text>
            {trend && TrendIcon ? (
              <Group gap={4}>
                <ThemeIcon size="sm" variant="transparent" color={trend.color}>
                  <TrendIcon size={14} />
                </ThemeIcon>
                <Text size="sm" c={trend.color}>
                  {trend.label}
                </Text>
              </Group>
            ) : null}
          </Group>

          <Badge color={color} variant="light" radius="sm" size="sm" style={{ width: "fit-content" }}>
            {BAND_LABEL[band]}
          </Badge>

          {lastAssessed ? (
            <Text size="xs" c="dimmed">
              Last assessed {lastAssessed}
            </Text>
          ) : (
            <Text size="xs" c="dimmed">
              Not yet assessed — update the score to start tracking trends.
            </Text>
          )}
        </Stack>

        <RingProgress
          size={96}
          thickness={10}
          roundCaps
          sections={[{ value: ringValue, color }]}
          label={
            <Text ta="center" size="sm" fw={700}>
              {ringValue}%
            </Text>
          }
        />
      </Group>

      {healthHistory.length > 0 ? (
        <Stack gap={6} mt="md">
          <Text size="xs" tt="uppercase" fw={700} c="dimmed">
            Recent history
          </Text>
          {healthHistory.slice(0, 3).map((entry) => {
            const b = healthBand(entry.healthScore);
            return (
              <Group key={entry.id} justify="space-between" gap="xs">
                <Text size="xs" c="dimmed">
                  {new Intl.DateTimeFormat("en-US", {
                    month: "short",
                    day: "numeric",
                  }).format(new Date(entry.assessmentDate))}
                </Text>
                <Badge color={BAND_COLOR[b]} variant="light" size="xs" radius="sm">
                  {entry.healthScore.toFixed(1)}
                </Badge>
              </Group>
            );
          })}
        </Stack>
      ) : null}
    </Paper>
  );
}
