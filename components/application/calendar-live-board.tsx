"use client";

import { useMemo, useState } from "react";
import { CalendarClock, MapPin, Tags, ChevronLeft, ChevronRight } from "lucide-react";
import {
  Button,
  Drawer,
  Divider,
  Group,
  NativeSelect,
  Paper,
  Stack,
  Switch,
  Text,
  TextInput,
  Textarea,
  Title,
  SimpleGrid,
  Badge,
} from "@mantine/core";

import {
  createCalendarEventAction,
  deleteCalendarEventAction,
  respondToCalendarEventRsvpAction,
  updateCalendarEventAction,
} from "@/app/calendar/actions";

import type { ChurchCalendarEvent } from "@/lib/church-calendar-data";

const categoryOptions = [
  "general",
  "informational",
  "administrative",
  "ministry",
  "internal",
  "liturgical",
  "prayer",
  "outreach",
  "worship",
] as const;

const visibilityOptions = ["public", "members", "leaders"] as const;

function formatCategory(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

function toDateTimeInputValue(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function getCategoryColor(category: string) {
  switch (category) {
    case "worship":
      return "#2563eb";
    case "prayer":
      return "#0f766e";
    case "outreach":
      return "#c2410c";
    case "administrative":
      return "#475569";
    case "ministry":
      return "#7c3aed";
    case "liturgical":
      return "#1d4ed8";
    case "informational":
      return "#0284c7";
    case "internal":
      return "#334155";
    default:
      return "#1f6feb";
  }
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
  canManageEvents,
}: {
  events: ChurchCalendarEvent[];
  churchTimeZone: string;
  canManageEvents: boolean;
}) {
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"month" | "week" | "day">("month");
  const [currentDate, setCurrentDate] = useState<Date>(new Date());

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

  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const getEventsForDate = (date: Date) => {
    return visibleEvents.filter((event) => {
      const eventDate = new Date(event.startsAt);
      return (
        eventDate.getFullYear() === date.getFullYear() &&
        eventDate.getMonth() === date.getMonth() &&
        eventDate.getDate() === date.getDate()
      );
    });
  };

  const renderMonthView = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = getDaysInMonth(currentDate);
    const firstDay = getFirstDayOfMonth(currentDate);
    const days = [];

    // Empty cells for days before month starts
    for (let i = 0; i < firstDay; i++) {
      days.push(
        <div key={`empty-${i}`} style={{ aspectRatio: "1/1" }} />
      );
    }

    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dayEvents = getEventsForDate(date);
      const isToday =
        date.toDateString() === new Date().toDateString();

      days.push(
        <Paper
          key={`day-${day}`}
          p="xs"
          withBorder
          style={{
            aspectRatio: "1/1",
            overflow: "auto",
            backgroundColor: isToday ? "rgba(37, 99, 235, 0.05)" : undefined,
            cursor: "pointer",
          }}
        >
          <Text fw={600} size="sm" mb={4}>
            {day}
          </Text>
          <Stack gap={2}>
            {dayEvents.slice(0, 3).map((event) => (
              <Group
                key={event.id}
                gap={4}
                wrap="nowrap"
                onClick={() => setSelectedEventId(event.id)}
                style={{ cursor: "pointer" }}
              >
                <div
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: "50%",
                    backgroundColor: getCategoryColor(event.category),
                    flexShrink: 0,
                  }}
                />
                <Text size="xs" truncate>
                  {event.title}
                </Text>
              </Group>
            ))}
            {dayEvents.length > 3 ? (
              <Text size="xs" c="dimmed">
                +{dayEvents.length - 3} more
              </Text>
            ) : null}
          </Stack>
        </Paper>
      );
    }

    return days;
  };

  const renderWeekView = () => {
    const startOfWeek = new Date(currentDate);
    startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());

    const hourSlots = Array.from({ length: 16 }, (_, i) => 6 + i); // 6am to 10pm
    const weekDays = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(startOfWeek);
      date.setDate(date.getDate() + i);
      return date;
    });

    return (
      <div style={{ overflowX: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "60px repeat(7, 1fr)", gap: 1 }}>
          {/* Time labels */}
          <div key="time-header" />
          {weekDays.map((date) => (
            <div key={`day-header-${date.toDateString()}`} style={{ textAlign: "center", paddingBottom: 8 }}>
              <Text fw={600} size="sm">
                {date.toLocaleDateString("en-US", { weekday: "short" })}
              </Text>
              <Text size="xs" c="dimmed">
                {date.getDate()}
              </Text>
            </div>
          ))}

          {/* Hour rows */}
          {hourSlots.map((hour) => (
            <div key={`hour-${hour}`} style={{ gridColumn: 1 }}>
              <Text size="xs" c="dimmed">
                {hour}:00
              </Text>
            </div>
          ))}

          {/* Events */}
          {weekDays.map((date, dayIndex) =>
            hourSlots.map((hour) => {
              const dayEvents = getEventsForDate(date).filter((event) => {
                const eventHour = new Date(event.startsAt).getHours();
                return eventHour === hour;
              });

              return (
                <div
                  key={`slot-${date.toDateString()}-${hour}`}
                  style={{
                    gridColumn: dayIndex + 2,
                    gridRow: hour - 6 + 2,
                    border: "1px solid #e0e0e0",
                    padding: 4,
                    minHeight: 60,
                  }}
                >
                  {dayEvents.map((event) => (
                    <Badge
                      key={event.id}
                      size="xs"
                      color="blue"
                      style={{ cursor: "pointer" }}
                      onClick={() => setSelectedEventId(event.id)}
                    >
                      {event.title}
                    </Badge>
                  ))}
                </div>
              );
            }),
          )}
        </div>
      </div>
    );
  };

  const renderDayView = () => {
    const dayEvents = getEventsForDate(currentDate).sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
    );

    return (
      <Stack gap="sm">
        <Text fw={600}>
          {currentDate.toLocaleDateString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </Text>
        {dayEvents.length ? (
          dayEvents.map((event) => (
            <Paper
              key={event.id}
              p="md"
              withBorder
              style={{ cursor: "pointer" }}
              onClick={() => setSelectedEventId(event.id)}
            >
              <Group justify="space-between" align="flex-start">
                <div>
                  <Text fw={600}>{event.title}</Text>
                  <Text size="sm" c="dimmed" mt={4}>
                    {formatTimeRange(event.startsAt, event.endsAt, churchTimeZone)}
                    {event.location ? ` • ${event.location}` : ""}
                  </Text>
                </div>
                <Badge color="blue">{formatCategory(event.category)}</Badge>
              </Group>
            </Paper>
          ))
        ) : (
          <Text c="dimmed" size="sm">
            No events scheduled for this day.
          </Text>
        )}
      </Stack>
    );
  };

  return (
    <>
      <Paper withBorder p="xl">
        <Group justify="space-between" align="center" mb="lg">
          <div>
            <Title order={3} size="h4">
              Working calendar
            </Title>
            <Text size="sm" c="dimmed" mt={4}>
              {viewMode === "month"
                ? "Month view"
                : viewMode === "week"
                  ? "Week view"
                  : "Day view"}{" "}
              with event-type filtering.
            </Text>
          </div>
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

        {canManageEvents ? (
          <Paper withBorder p="lg" mb="lg">
            <Text fw={600} mb="sm">
              Quick add event
            </Text>
            <form action={createCalendarEventAction}>
              <Stack gap="sm">
                <TextInput name="title" label="Title" placeholder="Wednesday prayer night" required />
                <TextInput name="location" label="Location" placeholder="Main hall" />
                <Group grow align="flex-start">
                  <TextInput
                    name="startsAt"
                    type="datetime-local"
                    label="Starts"
                    required
                  />
                  <TextInput
                    name="endsAt"
                    type="datetime-local"
                    label="Ends"
                    required
                  />
                </Group>
                <Group grow align="flex-start">
                  <NativeSelect
                    name="category"
                    label="Category"
                    defaultValue="general"
                    data={categoryOptions.map((value) => ({
                      value,
                      label: formatCategory(value),
                    }))}
                  />
                  <NativeSelect
                    name="visibility"
                    label="Visibility"
                    defaultValue="members"
                    data={visibilityOptions.map((value) => ({
                      value,
                      label: formatCategory(value),
                    }))}
                  />
                </Group>
                <TextInput name="ministryId" label="Ministry id (optional)" />
                <Textarea name="description" label="Description" minRows={2} />
                <Switch name="rsvpEnabled" label="Enable RSVP" defaultChecked />
                <Group justify="flex-end">
                  <Button type="submit" radius="xl" size="xs">
                    Add event
                  </Button>
                </Group>
              </Stack>
            </form>
          </Paper>
        ) : null}

        {/* View controls */}
        <Group justify="space-between" mb="md">
          <Group gap="sm">
            <Button
              size="compact-sm"
              variant={viewMode === "month" ? "filled" : "default"}
              onClick={() => setViewMode("month")}
            >
              Month
            </Button>
            <Button
              size="compact-sm"
              variant={viewMode === "week" ? "filled" : "default"}
              onClick={() => setViewMode("week")}
            >
              Week
            </Button>
            <Button
              size="compact-sm"
              variant={viewMode === "day" ? "filled" : "default"}
              onClick={() => setViewMode("day")}
            >
              Day
            </Button>
          </Group>

          <Group gap="sm">
            <Button
              size="compact-sm"
              variant="default"
              leftSection={<ChevronLeft size={16} />}
              onClick={() => {
                const newDate = new Date(currentDate);
                if (viewMode === "month") {
                  newDate.setMonth(newDate.getMonth() - 1);
                } else if (viewMode === "week") {
                  newDate.setDate(newDate.getDate() - 7);
                } else {
                  newDate.setDate(newDate.getDate() - 1);
                }
                setCurrentDate(newDate);
              }}
            >
              Prev
            </Button>
            <Button
              size="compact-sm"
              variant="default"
              onClick={() => setCurrentDate(new Date())}
            >
              Today
            </Button>
            <Button
              size="compact-sm"
              variant="default"
              rightSection={<ChevronRight size={16} />}
              onClick={() => {
                const newDate = new Date(currentDate);
                if (viewMode === "month") {
                  newDate.setMonth(newDate.getMonth() + 1);
                } else if (viewMode === "week") {
                  newDate.setDate(newDate.getDate() + 7);
                } else {
                  newDate.setDate(newDate.getDate() + 1);
                }
                setCurrentDate(newDate);
              }}
            >
              Next
            </Button>
          </Group>
        </Group>

        {/* Calendar render */}
        {viewMode === "month" ? (
          <SimpleGrid cols={7} spacing={1} mb="lg">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <Text key={day} fw={600} size="sm" ta="center">
                {day}
              </Text>
            ))}
            {renderMonthView()}
          </SimpleGrid>
        ) : viewMode === "week" ? (
          <Paper mb="lg" style={{ overflowX: "auto" }}>
            {renderWeekView()}
          </Paper>
        ) : (
          <Stack mb="lg" gap="sm">
            {renderDayView()}
          </Stack>
        )}

        <Divider my="lg" />

        <Stack gap="sm">
          <Text fw={600} size="sm">
            Agenda snapshot
          </Text>
          {groupedEvents.length ? (
            groupedEvents.map(([dayLabel, dayEvents]) => (
              <div key={dayLabel}>
                <Text fw={600} mb={6} size="sm">
                  {dayLabel}
                </Text>
                <Stack gap={6} mb="sm">
                  {dayEvents.map((event) => (
                    <Group key={event.id} justify="space-between" wrap="nowrap">
                      <Text size="sm" truncate>
                        {event.title}
                      </Text>
                      <Button size="compact-xs" variant="subtle" onClick={() => setSelectedEventId(event.id)}>
                        Open
                      </Button>
                    </Group>
                  ))}
                </Stack>
              </div>
            ))
          ) : (
            <Text c="dimmed" size="sm">
              No agenda items.
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
              <Text size="sm" mt={4}>
                Your RSVP: {selectedEvent.viewerRsvpStatus ? formatCategory(selectedEvent.viewerRsvpStatus) : "Not answered"}
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

            {selectedEvent.rsvpEnabled ? (
              <Paper withBorder p="md">
                <Text fw={600} size="sm" mb="sm">
                  RSVP response
                </Text>
                <form action={respondToCalendarEventRsvpAction}>
                  <input type="hidden" name="eventId" value={selectedEvent.id} />
                  <Stack gap="sm">
                    <Textarea name="note" label="Note (optional)" minRows={2} />
                    <Group gap="xs" wrap="wrap">
                      <Button type="submit" name="status" value="yes" size="xs" radius="xl">
                        Yes
                      </Button>
                      <Button
                        type="submit"
                        name="status"
                        value="maybe"
                        size="xs"
                        radius="xl"
                        variant="default"
                      >
                        Maybe
                      </Button>
                      <Button
                        type="submit"
                        name="status"
                        value="no"
                        size="xs"
                        radius="xl"
                        color="red"
                        variant="light"
                      >
                        No
                      </Button>
                    </Group>
                  </Stack>
                </form>
              </Paper>
            ) : null}

            {canManageEvents ? (
              <Paper withBorder p="md">
                <Text fw={600} size="sm" mb="sm">
                  Edit event
                </Text>
                <form action={updateCalendarEventAction}>
                  <input type="hidden" name="eventId" value={selectedEvent.id} />
                  <Stack gap="sm">
                    <TextInput name="title" label="Title" defaultValue={selectedEvent.title} required />
                    <TextInput name="location" label="Location" defaultValue={selectedEvent.location ?? ""} />
                    <Group grow align="flex-start">
                      <TextInput
                        name="startsAt"
                        type="datetime-local"
                        label="Starts"
                        defaultValue={toDateTimeInputValue(selectedEvent.startsAt)}
                        required
                      />
                      <TextInput
                        name="endsAt"
                        type="datetime-local"
                        label="Ends"
                        defaultValue={toDateTimeInputValue(selectedEvent.endsAt)}
                        required
                      />
                    </Group>
                    <Group grow align="flex-start">
                      <NativeSelect
                        name="category"
                        label="Category"
                        defaultValue={selectedEvent.category}
                        data={categoryOptions.map((value) => ({
                          value,
                          label: formatCategory(value),
                        }))}
                      />
                      <NativeSelect
                        name="visibility"
                        label="Visibility"
                        defaultValue={selectedEvent.visibility}
                        data={visibilityOptions.map((value) => ({
                          value,
                          label: formatCategory(value),
                        }))}
                      />
                    </Group>
                    <TextInput
                      name="ministryId"
                      label="Ministry id (optional)"
                      defaultValue={selectedEvent.ministryId ?? ""}
                    />
                    <Textarea
                      name="description"
                      label="Description"
                      minRows={2}
                      defaultValue={selectedEvent.description ?? ""}
                    />
                    <Switch
                      name="rsvpEnabled"
                      label="Enable RSVP"
                      defaultChecked={selectedEvent.rsvpEnabled}
                    />
                    <Group justify="space-between">
                      <Button type="submit" size="xs" radius="xl">
                        Save changes
                      </Button>
                      <Button
                        formAction={deleteCalendarEventAction}
                        type="submit"
                        size="xs"
                        radius="xl"
                        color="red"
                        variant="light"
                      >
                        Delete event
                      </Button>
                    </Group>
                  </Stack>
                </form>
              </Paper>
            ) : null}
          </Stack>
        ) : null}
      </Drawer>
    </>
  );
}
