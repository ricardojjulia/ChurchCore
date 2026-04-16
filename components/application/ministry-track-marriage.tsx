"use client";

import { Alert, Badge, Group, Paper, SimpleGrid, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import { Heart, ShieldCheck, Users } from "lucide-react";

import { AI_ASSISTIVE_DISCLAIMER } from "@/lib/ministry-forge-types";
import type { MarriageTrackData } from "@/lib/ministry-forge-types";

const COHORT_LABELS: Record<string, string> = {
  newlywed: "Newlywed (0–1 yr)",
  "1_5_years": "1–5 Years",
  "5_15_years": "5–15 Years",
  "15_25_years": "15–25 Years",
  "25_plus": "25+ Years",
};

export function MarriageTrackPanel({
  data,
  isPastor,
}: {
  data: MarriageTrackData;
  isPastor: boolean;
}) {
  return (
    <Stack gap="lg">
      <Alert color="gray" radius="md" icon={<ShieldCheck size={16} />}>
        Marriage ministry data is confidential. Visible only to pastors and authorized church leaders.
      </Alert>

      {/* Mentor couples */}
      <Paper withBorder radius="xl" p="xl">
        <Group gap="sm" mb="md">
          <ThemeIcon variant="light" color="rose" radius="xl" size="lg">
            <Heart size={18} />
          </ThemeIcon>
          <div>
            <Title order={4}>Mentor Couples</Title>
            <Text size="sm" c="dimmed">Experienced couples available to walk alongside others.</Text>
          </div>
        </Group>

        {data.mentorCouples.length ? (
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
            {data.mentorCouples.map((couple) => (
              <Paper key={couple.id} withBorder radius="lg" p="md" bg="#f8fafc">
                <Group justify="space-between" align="flex-start">
                  <div>
                    <Text fw={600}>{couple.coupleName ?? couple.partner1Name}</Text>
                    {couple.yearsMarried ? (
                      <Text size="xs" c="dimmed" mt={2}>{couple.yearsMarried} years married</Text>
                    ) : null}
                    {couple.cohortFocus ? (
                      <Badge size="xs" color="pink" variant="light" mt={4}>
                        {COHORT_LABELS[couple.cohortFocus] ?? couple.cohortFocus}
                      </Badge>
                    ) : null}
                  </div>
                  <Badge
                    color={couple.isAvailable ? "teal" : "gray"}
                    variant="light"
                    size="sm"
                  >
                    {couple.isAvailable ? "Available" : "At capacity"}
                  </Badge>
                </Group>
              </Paper>
            ))}
          </SimpleGrid>
        ) : (
          <Text size="sm" c="dimmed">No mentor couples registered yet. Add experienced couples to begin the cohort model.</Text>
        )}
      </Paper>

      {/* Enrichment cohorts */}
      <Paper withBorder radius="xl" p="xl">
        <Group gap="sm" mb="md">
          <ThemeIcon variant="light" color="indigo" radius="xl" size="lg">
            <Users size={18} />
          </ThemeIcon>
          <div>
            <Title order={4}>Enrichment Cohorts</Title>
            <Text size="sm" c="dimmed">Couples grouped by marriage season with a mentor couple.</Text>
          </div>
        </Group>

        {data.cohorts.length ? (
          <Stack gap="sm">
            {data.cohorts.map((cohort) => (
              <Paper key={cohort.id} withBorder radius="lg" p="md" bg="#f8fafc">
                <Group justify="space-between" align="flex-start">
                  <div>
                    <Text fw={600}>{cohort.name}</Text>
                    <Badge size="xs" color="indigo" variant="light" mt={4}>
                      {COHORT_LABELS[cohort.cohortStage] ?? cohort.cohortStage}
                    </Badge>
                    {cohort.mentorCoupleName ? (
                      <Text size="sm" c="dimmed" mt={4}>
                        Mentored by {cohort.mentorCoupleName}
                      </Text>
                    ) : null}
                  </div>
                  <Badge color="churchBlue" variant="light" size="sm">
                    {cohort.coupleCount} couple{cohort.coupleCount !== 1 ? "s" : ""}
                  </Badge>
                </Group>
              </Paper>
            ))}
          </Stack>
        ) : (
          <Text size="sm" c="dimmed">No cohorts yet. Group couples by stage and assign a mentor couple to each cohort.</Text>
        )}
      </Paper>

      {/* Pastoral themes — pastor-only */}
      {isPastor ? (
        <Paper withBorder radius="xl" p="xl">
          <Group gap="sm" mb="md">
            <ThemeIcon variant="light" color="orange" radius="xl" size="lg">
              <ShieldCheck size={18} />
            </ThemeIcon>
            <div>
              <Title order={4}>Pastoral Themes (Confidential)</Title>
              <Text size="sm" c="dimmed">
                Anonymous aggregate signals from cohort leaders — for sermon and care planning only.
                Never individual-attributed.
              </Text>
            </div>
          </Group>
          <Text size="sm" c="dimmed" fs="italic">
            Aggregate theme visibility will appear here once cohort check-ins are collected.
          </Text>
          <Text size="xs" c="dimmed" mt="sm" fs="italic">
            {AI_ASSISTIVE_DISCLAIMER}
          </Text>
        </Paper>
      ) : null}
    </Stack>
  );
}
