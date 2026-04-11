"use client";

import { useMemo, useState } from "react";
import { CalendarClock, MapPin, Tags } from "lucide-react";
import {
  Badge,
  Button,
  Drawer,
  Group,
  Paper,
  Stack,
  Text,
  Title,
} from "@mantine/core";

import type { ChurchCalendarEvent } from "@/lib/church-calendar-data";

function formatCategory(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatDay(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone,
  }).format(new Date(value));
}

function formatTimeRange(start: string, end: string, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });

  return `${formatter.format(new Date(start))} - ${formatter.format(new Date(end))}`;
}

export function CalendarLiveBoard({
  events,
  churchTimeZone,
}: {
  events: ChurchCalendarEvent[];
  churchTimeZone: string;
}) {
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const categories = useMemo(
    () => ["all", ...new Set(events.map((event) => event.category))],
    [events],
  );

  const visibleEvents = useMemo(
    () =>
      activeCategory === "all"
        ? events
        : events.filter((event) => event.category === activeCategory),
    [activeCategory, events],
  );

  const groupedEvents = useMemo(
    () =>
      Array.from(
        visibleEvents.reduce((days, event) => {
          const dayLabel = formatDay(event.startsAt, churchTimeZone);
          const dayEvents = days.get(dayLabel) ?? [];
          dayEvents.push(event);
          days.set(dayLabel, dayEvents);
          return days;
        }, new Map<string, ChurchCalendarEvent[]>()),
      ),
    [churchTimeZone, visibleEvents],
  );

  const selectedEvent = events.find((event) => event.id === selectedEventId) ?? null;

  return (
    <>
      <Paper withBorder p="xl">
        <Group justify="space-between" align="center" mb="lg">
          <Title order={3} size="h4">
            Upcoming events
          </Title>
          <Group gap="xs" wrap="wrap">
            {categories.map((category) => (
              <Button
                key={category}
                radius="xl"
                size="xs"
                variant={activeCategory === category ? "filled" : "default"}
                onClick={() => setActiveCategory(category)}
              >
                {category === "all" ? "All" : formatCategory(category)}
              </Button>
            ))}
          </Group>
        </Group>

        <Stack gap="lg">
          {groupedEvents.length ? (
            groupedEvents.map(([dayLabel, dayEvents]) => (
              <div key={dayLabel}>
                <Text fw={600} mb="sm">
                  {dayLabel}
                </Text>
                <Stack gap="sm">
                  {dayEvents.map((event) => (
                    <Paper key={event.id} p="lg" bg="gray.0">
                      <Group justify="space-between" align="flex-start" gap="md">
                        <div>
                          <Text fw={600}>{event.title}</Text>
                          <Text c="dimmed" size="sm" mt={6}>
                            {formatTimeRange(event.startsAt, event.endsAt, churchTimeZone)}
                            {event.location ? ` • ${event.location}` : ""}
                          </Text>
                          {event.ministryName ? (
                            <Text size="sm" mt={6}>
                              {event.ministryName}
                            </Text>
                          ) : null}
                        </div>
                        <Group gap="xs" align="center">
                          <Badge color="gray" variant="light">
                            {formatCategory(event.category)}
                          </Badge>
                          <Button
                            radius="xl"
                            size="xs"
                            variant="default"
                            onClick={() => setSelectedEventId(event.id)}
                          >
                            Details
                          </Button>
                        </Group>
                      </Group>
                    </Paper>
                  ))}
                </Stack>
              </div>
            ))
          ) : (
            <Text c="dimmed" size="sm">
              No upcoming events.
            </Text>
          )}
        </Stack>
      </Paper>

      <Drawer
        opened={Boolean(selectedEvent)}
        onClose={() => setSelectedEventId(null)}
        title={selectedEvent?.title}
        position="right"
        size="md"
      >
        {selectedEvent ? (
          <Stack gap="md">
            <Paper withBorder p="md">
              <Group gap="sm" mb="sm">
                <CalendarClock size={16} />
                <Text fw={600} size="sm">
                  Time
                </Text>
              </Group>
              <Text size="sm">
                {formatDay(selectedEvent.startsAt, churchTimeZone)}
              </Text>
              <Text size="sm" c="dimmed" mt={4}>
                {formatTimeRange(
                  selectedEvent.startsAt,
                  selectedEvent.endsAt,
                  churchTimeZone,
                )}
              </Text>
            </Paper>

            <Paper withBorder p="md">
              <Group gap="sm" mb="sm">
                <Tags size={16} />
                <Text fw={600} size="sm">
                  Details
                </Text>
              </Group>
              <Text size="sm">Category: {formatCategory(selectedEvent.category)}</Text>
              <Text size="sm" mt={4}>
                Visibility: {formatCategory(selectedEvent.visibility)}
              </Text>
              <Text size="sm" mt={4}>
                Approval: {formatCategory(selectedEvent.approvalStatus)}
              </Text>
              <Text size="sm" mt={4}>
                RSVP: {selectedEvent.rsvpEnabled ? "Enabled" : "Off"}
              </Text>
              {selectedEvent.ministryName ? (
                <Text size="sm" mt={4}>
                  Ministry: {selectedEvent.ministryName}
                </Text>
              ) : null}
            </Paper>

            {selectedEvent.location ? (
              <Paper withBorder p="md">
                <Group gap="sm" mb="sm">
                  <MapPin size={16} />
                  <Text fw={600} size="sm">
                    Location
                  </Text>
                </Group>
                <Text size="sm">{selectedEvent.location}</Text>
              </Paper>
            ) : null}

            {selectedEvent.description ? (
              <Paper withBorder p="md">
                <Text size="sm">{selectedEvent.description}</Text>
              </Paper>
            ) : null}
          </Stack>
        ) : null}
      </Drawer>
    </>
  );
}
