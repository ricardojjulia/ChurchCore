"use client";

import Link from "next/link";
import { Badge, Group, Paper, RingProgress, Text, ThemeIcon, Title } from "@mantine/core";
import { Flame, Users } from "lucide-react";

import type { MinistryForgeEntry, MinistryHealthBand } from "@/lib/ministry-forge-types";
import { healthBand } from "@/lib/ministry-forge-types";

const MINISTRY_TYPE_LABELS: Record<string, string> = {
  outreach: "Outreach",
  discipleship: "Discipleship",
  worship: "Worship",
  care: "Care",
  administration: "Administration",
  youth: "Youth",
  children: "Children",
  missions: "Missions",
};

const BAND_COLOR: Record<MinistryHealthBand, string> = {
  green: "teal",
  yellow: "yellow",
  red: "red",
};

export function MinistryCard({
  ministry,
  forgeHref,
}: {
  ministry: MinistryForgeEntry;
  forgeHref: string;
}) {
  const band = healthBand(ministry.healthScore);
  const ringColor = BAND_COLOR[band];
  const ringValue = Math.round((ministry.healthScore / 10) * 100);

  return (
    <Paper
      component={Link}
      href={forgeHref}
      withBorder
      radius="xl"
      p="lg"
      style={{ textDecoration: "none", display: "block", cursor: "pointer" }}
    >
      <Group justify="space-between" align="flex-start" gap="md">
        <div style={{ flex: 1, minWidth: 0 }}>
          <Group gap="xs" mb={4}>
            {ministry.ministryType ? (
              <Badge variant="light" color="churchBlue" radius="sm" size="sm">
                {MINISTRY_TYPE_LABELS[ministry.ministryType] ?? ministry.ministryType}
              </Badge>
            ) : null}
          </Group>

          <Title order={4} lineClamp={1}>
            {ministry.name}
          </Title>

          {ministry.visionStatement ? (
            <Text size="sm" c="dimmed" mt={4} lineClamp={2}>
              {ministry.visionStatement}
            </Text>
          ) : null}

          <Group gap="sm" mt="sm">
            <Group gap={4}>
              <ThemeIcon size="sm" variant="transparent" color="dimmed">
                <Users size={13} />
              </ThemeIcon>
              <Text size="xs" c="dimmed">
                {ministry.memberCount} {ministry.memberCount === 1 ? "member" : "members"}
              </Text>
            </Group>
            {ministry.scripturalAnchor.length > 0 ? (
              <Group gap={4}>
                <ThemeIcon size="sm" variant="transparent" color="dimmed">
                  <Flame size={13} />
                </ThemeIcon>
                <Text size="xs" c="dimmed">
                  {ministry.scripturalAnchor[0]}
                  {ministry.scripturalAnchor.length > 1
                    ? ` +${ministry.scripturalAnchor.length - 1}`
                    : ""}
                </Text>
              </Group>
            ) : null}
          </Group>
        </div>

        <RingProgress
          size={60}
          thickness={6}
          roundCaps
          sections={[{ value: ringValue, color: ringColor }]}
          label={
            <Text ta="center" size="xs" fw={700}>
              {ministry.healthScore.toFixed(1)}
            </Text>
          }
        />
      </Group>
    </Paper>
  );
}
