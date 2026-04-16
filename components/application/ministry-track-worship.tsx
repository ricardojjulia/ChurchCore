"use client";

import { Badge, Group, Paper, SimpleGrid, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import { CalendarRange, Music, RotateCcw } from "lucide-react";

import type { WorshipTrackData } from "@/lib/ministry-forge-types";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function weeksAgo(dateStr: string): number {
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / (7 * 24 * 60 * 60 * 1000));
}

export function WorshipTrackPanel({ data }: { data: WorshipTrackData }) {
  return (
    <Stack gap="lg">
      {/* Rehearsal schedule */}
      <Paper withBorder radius="xl" p="xl">
        <Group gap="sm" mb="md">
          <ThemeIcon variant="light" color="churchBlue" radius="xl" size="lg">
            <CalendarRange size={18} />
          </ThemeIcon>
          <div>
            <Title order={4}>Rehearsal Schedule</Title>
            <Text size="sm" c="dimmed">Upcoming rehearsals and preparation notes.</Text>
          </div>
        </Group>

        {data.rehearsals.length ? (
          <Stack gap="sm">
            {data.rehearsals.map((r) => (
              <Paper key={r.id} withBorder radius="lg" p="md" bg="#f8fafc">
                <Group justify="space-between" align="flex-start">
                  <div>
                    <Text fw={600}>{formatDate(r.scheduledAt)}</Text>
                    {r.notes ? <Text size="sm" c="dimmed" mt={4}>{r.notes}</Text> : null}
                    <Text size="xs" c="dimmed" mt={4}>
                      {r.songIds.length} song{r.songIds.length !== 1 ? "s" : ""} planned
                    </Text>
                  </div>
                  <Badge color="teal" variant="light" radius="sm">
                    {r.rsvpCount} RSVP{r.rsvpCount !== 1 ? "s" : ""}
                  </Badge>
                </Group>
              </Paper>
            ))}
          </Stack>
        ) : (
          <Text size="sm" c="dimmed">No rehearsals scheduled yet.</Text>
        )}
      </Paper>

      {/* Song library */}
      <Paper withBorder radius="xl" p="xl">
        <Group gap="sm" mb="md">
          <ThemeIcon variant="light" color="violet" radius="xl" size="lg">
            <Music size={18} />
          </ThemeIcon>
          <div>
            <Title order={4}>Song Library</Title>
            <Text size="sm" c="dimmed">Song catalog with key, tempo, and recency.</Text>
          </div>
        </Group>

        {data.songs.length ? (
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
            {data.songs.map((song) => {
              const weeks = song.lastUsedAt ? weeksAgo(song.lastUsedAt) : null;
              const overused = weeks !== null && weeks < 2;
              return (
                <Paper key={song.id} withBorder radius="lg" p="md" bg="#f8fafc">
                  <Group justify="space-between" align="flex-start" gap="xs">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Text fw={600} truncate>{song.title}</Text>
                      {song.artist ? <Text size="xs" c="dimmed">{song.artist}</Text> : null}
                      <Group gap="xs" mt={6}>
                        {song.songKey ? <Badge size="xs" variant="outline" color="gray">Key: {song.songKey}</Badge> : null}
                        {song.tempo ? <Badge size="xs" variant="outline" color="gray">{song.tempo}</Badge> : null}
                      </Group>
                      {song.tags.length > 0 ? (
                        <Group gap={4} mt={4}>
                          {song.tags.slice(0, 3).map((t) => (
                            <Badge key={t} size="xs" variant="light" color="churchBlue">{t}</Badge>
                          ))}
                        </Group>
                      ) : null}
                    </div>
                    <Stack gap={4} align="flex-end">
                      {song.lastUsedAt ? (
                        <Badge
                          size="xs"
                          color={overused ? "orange" : "gray"}
                          variant="light"
                          leftSection={<RotateCcw size={10} />}
                        >
                          {weeks === 0 ? "This week" : `${weeks}w ago`}
                        </Badge>
                      ) : (
                        <Badge size="xs" color="gray" variant="light">Never used</Badge>
                      )}
                    </Stack>
                  </Group>
                </Paper>
              );
            })}
          </SimpleGrid>
        ) : (
          <Text size="sm" c="dimmed">No songs in the library yet. Add songs to build your catalog.</Text>
        )}
      </Paper>
    </Stack>
  );
}
