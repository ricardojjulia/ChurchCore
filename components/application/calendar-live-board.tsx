"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, ChevronLeft, ChevronRight, MapPin, Tags } from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Divider,
  Drawer,
  Group,
  NativeSelect,
  Paper,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
  Textarea,
  Title,
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

type FeedbackState =
  | {
      tone: "error" | "success";
      message: string;
    }
  | null;

type PendingAction = "create" | "update" | "delete" | "rsvp" | null;

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

function toChurchDateKey(value: Date | string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    return "";
  }

  return `${year}-${month}-${day}`;
}

function formatDay(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone,
  }).format(new Date(value));
}

function formatDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function formatTimeRange(start: string, end: string, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });

  return `${formatter.format(new Date(start))} - ${formatter.format(new Date(end))}`;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

export function CalendarLiveBoard({
  events,
  churchTimeZone,
  canManageEvents,
  canOpenEventWorkspace = false,
}: {
  events: ChurchCalendarEvent[];
  churchTimeZone: string;
  canManageEvents: boolean;
  canOpenEventWorkspace?: boolean;
}) {
  const router = useRouter();
  const createFormRef = useRef<HTMLFormElement>(null);

  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"month" | "week" | "day">("month");
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [isPending, startTransition] = useTransition();

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

  const eventsByDay = useMemo(() => {
    const days = new Map<string, ChurchCalendarEvent[]>();

    visibleEvents.forEach((event) => {
      const dayKey = toChurchDateKey(event.startsAt, churchTimeZone);
      const dayEvents = days.get(dayKey) ?? [];
      dayEvents.push(event);
      days.set(dayKey, dayEvents);
    });

    days.forEach((dayEvents) => {
      dayEvents.sort(
        (left, right) =>
          new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime(),
      );
    });

    return days;
  }, [churchTimeZone, visibleEvents]);

  const agendaDays = useMemo(
    () =>
      Array.from(eventsByDay.entries())
        .map(([dayKey, dayEvents]) => ({
          dayKey,
          label: formatDateKey(dayKey),
          events: dayEvents,
        }))
        .sort((left, right) => left.dayKey.localeCompare(right.dayKey)),
    [eventsByDay],
  );

  const selectedEvent = events.find((event) => event.id === selectedEventId) ?? null;
  const selectedDayEvents = selectedDateKey ? eventsByDay.get(selectedDateKey) ?? [] : [];
  const currentDateKey = toChurchDateKey(currentDate, churchTimeZone);
  const todayKey = toChurchDateKey(new Date(), churchTimeZone);
  const drawerOpened = Boolean(selectedEvent || selectedDateKey);

  function getEventsForDate(date: Date) {
    return eventsByDay.get(toChurchDateKey(date, churchTimeZone)) ?? [];
  }

  function openDate(date: Date) {
    setCurrentDate(date);
    setSelectedDateKey(toChurchDateKey(date, churchTimeZone));
    setSelectedEventId(null);
    setFeedback(null);
  }

  function openEvent(event: ChurchCalendarEvent) {
    setSelectedDateKey(toChurchDateKey(event.startsAt, churchTimeZone));
    setSelectedEventId(event.id);
    setFeedback(null);
  }

  function handleDrawerClose() {
    if (selectedEventId) {
      setSelectedEventId(null);
      return;
    }

    setSelectedDateKey(null);
    setFeedback(null);
  }

  function runAction(
    action: PendingAction,
    task: () => Promise<void>,
    options?: {
      successMessage?: string;
      onSuccess?: () => void;
    },
  ) {
    setFeedback(null);
    setPendingAction(action);

    startTransition(async () => {
      try {
        await task();
        if (options?.successMessage) {
          setFeedback({
            tone: "success",
            message: options.successMessage,
          });
        }
        options?.onSuccess?.();
        router.refresh();
      } catch (error) {
        setFeedback({
          tone: "error",
          message: getErrorMessage(error),
        });
      } finally {
        setPendingAction(null);
      }
    });
  }

  function handleCreateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    runAction("create", () => createCalendarEventAction(formData), {
      successMessage: "Event added to the calendar.",
      onSuccess: () => {
        form.reset();
      },
    });
  }

  function handleUpdateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    runAction("update", () => updateCalendarEventAction(formData), {
      successMessage: "Event updated.",
    });
  }

  function handleDelete(eventId: string) {
    const formData = new FormData();
    formData.set("eventId", eventId);

    runAction("delete", () => deleteCalendarEventAction(formData), {
      successMessage: "Event deleted.",
      onSuccess: () => {
        setSelectedEventId(null);
        setSelectedDateKey(null);
      },
    });
  }

  function handleRsvpSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const submitter = (event.nativeEvent as SubmitEvent).submitter as
      | HTMLButtonElement
      | undefined;
    const status = submitter?.value;

    if (status) {
      formData.set("status", status);
    }

    runAction("rsvp", () => respondToCalendarEventRsvpAction(formData), {
      successMessage: "RSVP updated.",
    });
  }

  function getDaysInMonth(date: Date) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  }

  function getFirstDayOfMonth(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  }

  function renderMonthView() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = getDaysInMonth(currentDate);
    const firstDay = getFirstDayOfMonth(currentDate);
    const days = [];

    for (let index = 0; index < firstDay; index += 1) {
      days.push(<div key={`empty-${index}`} style={{ aspectRatio: "1 / 1" }} />);
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(year, month, day);
      const dayKey = toChurchDateKey(date, churchTimeZone);
      const dayEvents = getEventsForDate(date);
      const isToday = dayKey === todayKey;

      days.push(
        <Paper
          key={`day-${day}`}
          p="xs"
          withBorder
          onClick={() => openDate(date)}
          style={{
            aspectRatio: "1 / 1",
            overflow: "auto",
            backgroundColor: isToday ? "rgba(37, 99, 235, 0.05)" : undefined,
            cursor: "pointer",
          }}
        >
          <Group justify="space-between" align="center" mb={4}>
            <Text fw={600} size="sm">
              {day}
            </Text>
            {dayEvents.length ? (
              <Badge size="xs" variant="light" color="gray">
                {dayEvents.length}
              </Badge>
            ) : null}
          </Group>
          <Stack gap={2}>
            {dayEvents.slice(0, 3).map((calendarEvent) => (
              <Group
                key={calendarEvent.id}
                gap={4}
                wrap="nowrap"
                onClick={(clickEvent) => {
                  clickEvent.stopPropagation();
                  openEvent(calendarEvent);
                }}
                style={{ cursor: "pointer" }}
              >
                <div
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: "50%",
                    backgroundColor: getCategoryColor(calendarEvent.category),
                    flexShrink: 0,
                  }}
                />
                <Text size="xs" truncate>
                  {calendarEvent.title}
                </Text>
              </Group>
            ))}
            {dayEvents.length > 3 ? (
              <Text size="xs" c="dimmed">
                +{dayEvents.length - 3} more
              </Text>
            ) : null}
          </Stack>
        </Paper>,
      );
    }

    return days;
  }

  function renderWeekView() {
    const startOfWeek = new Date(currentDate);
    startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());

    const hourSlots = Array.from({ length: 16 }, (_, index) => 6 + index);
    const weekDays = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(startOfWeek);
      date.setDate(date.getDate() + index);
      return date;
    });

    return (
      <div style={{ overflowX: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "60px repeat(7, 1fr)", gap: 1 }}>
          <div key="time-header" />
          {weekDays.map((date) => (
            <div
              key={`day-header-${date.toDateString()}`}
              onClick={() => openDate(date)}
              style={{ textAlign: "center", paddingBottom: 8, cursor: "pointer" }}
            >
              <Text fw={600} size="sm">
                {date.toLocaleDateString("en-US", { weekday: "short" })}
              </Text>
              <Text size="xs" c="dimmed">
                {date.getDate()}
              </Text>
            </div>
          ))}

          {hourSlots.map((hour) => (
            <div key={`hour-${hour}`} style={{ gridColumn: 1 }}>
              <Text size="xs" c="dimmed">
                {hour}:00
              </Text>
            </div>
          ))}

          {weekDays.map((date, dayIndex) =>
            hourSlots.map((hour) => {
              const dayEvents = getEventsForDate(date).filter((calendarEvent) => {
                const eventHour = new Date(calendarEvent.startsAt).getHours();
                return eventHour === hour;
              });

              return (
                <div
                  key={`slot-${date.toDateString()}-${hour}`}
                  onClick={() => openDate(date)}
                  style={{
                    gridColumn: dayIndex + 2,
                    gridRow: hour - 6 + 2,
                    border: "1px solid #e0e0e0",
                    padding: 4,
                    minHeight: 60,
                    cursor: "pointer",
                  }}
                >
                  <Stack gap={4}>
                    {dayEvents.map((calendarEvent) => (
                      <Badge
                        key={calendarEvent.id}
                        size="xs"
                        color="blue"
                        style={{ cursor: "pointer" }}
                        onClick={(clickEvent) => {
                          clickEvent.stopPropagation();
                          openEvent(calendarEvent);
                        }}
                      >
                        {calendarEvent.title}
                      </Badge>
                    ))}
                  </Stack>
                </div>
              );
            }),
          )}
        </div>
      </div>
    );
  }

  function renderDayView() {
    const dayEvents = getEventsForDate(currentDate);

    return (
      <Stack gap="sm">
        <Text fw={600}>{formatDateKey(currentDateKey)}</Text>
        {dayEvents.length ? (
          dayEvents.map((calendarEvent) => (
            <Paper
              key={calendarEvent.id}
              p="md"
              withBorder
              style={{ cursor: "pointer" }}
              onClick={() => openEvent(calendarEvent)}
            >
              <Group justify="space-between" align="flex-start">
                <div>
                  <Text fw={600}>{calendarEvent.title}</Text>
                  <Text size="sm" c="dimmed" mt={4}>
                    {formatTimeRange(
                      calendarEvent.startsAt,
                      calendarEvent.endsAt,
                      churchTimeZone,
                    )}
                    {calendarEvent.location ? ` • ${calendarEvent.location}` : ""}
                  </Text>
                </div>
                <Badge color="blue">{formatCategory(calendarEvent.category)}</Badge>
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
  }

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
              with event-type filtering and day details.
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

        {feedback ? (
          <Alert color={feedback.tone === "error" ? "red" : "teal"} mb="lg">
            {feedback.message}
          </Alert>
        ) : null}

        {canManageEvents ? (
          <Paper withBorder p="lg" mb="lg">
            <Text fw={600} mb="sm">
              Quick add event
            </Text>
            <form ref={createFormRef} onSubmit={handleCreateSubmit}>
              <Stack gap="sm">
                <TextInput name="title" label="Title" placeholder="Wednesday prayer night" required />
                <TextInput name="location" label="Location" placeholder="Main hall" />
                <Group grow align="flex-start">
                  <TextInput name="startsAt" type="datetime-local" label="Starts" required />
                  <TextInput name="endsAt" type="datetime-local" label="Ends" required />
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
                  <Button type="submit" radius="xl" size="xs" loading={isPending && pendingAction === "create"}>
                    Add event
                  </Button>
                </Group>
              </Stack>
            </form>
          </Paper>
        ) : null}

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
            <Button size="compact-sm" variant="default" onClick={() => setCurrentDate(new Date())}>
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
          {agendaDays.length ? (
            agendaDays.map((day) => (
              <Paper key={day.dayKey} withBorder p="md">
                <Group justify="space-between" align="center" mb="sm">
                  <Button variant="subtle" size="compact-sm" onClick={() => openDate(new Date(`${day.dayKey}T12:00:00`))}>
                    {day.label}
                  </Button>
                  <Badge variant="light" color="gray">
                    {day.events.length}
                  </Badge>
                </Group>
                <Stack gap={8}>
                  {day.events.map((calendarEvent) => (
                    <Group key={calendarEvent.id} justify="space-between" wrap="nowrap" align="flex-start">
                      <div>
                        <Text size="sm" fw={600}>
                          {calendarEvent.title}
                        </Text>
                        <Text size="xs" c="dimmed" mt={2}>
                          {formatTimeRange(calendarEvent.startsAt, calendarEvent.endsAt, churchTimeZone)}
                          {calendarEvent.location ? ` • ${calendarEvent.location}` : ""}
                        </Text>
                      </div>
                      <Group gap={6} wrap="nowrap">
                        <Badge size="xs" variant="light" color="blue">
                          {formatCategory(calendarEvent.category)}
                        </Badge>
                        <Button size="compact-xs" variant="subtle" onClick={() => openEvent(calendarEvent)}>
                          Open
                        </Button>
                      </Group>
                    </Group>
                  ))}
                </Stack>
              </Paper>
            ))
          ) : (
            <Text c="dimmed" size="sm">
              No agenda items in the current calendar window.
            </Text>
          )}
        </Stack>
      </Paper>

      <Drawer
        opened={drawerOpened}
        onClose={handleDrawerClose}
        title={selectedEvent ? selectedEvent.title : selectedDateKey ? formatDateKey(selectedDateKey) : ""}
        position="right"
        size="md"
      >
        {selectedEvent ? (
          <Stack gap="md">
            {feedback ? (
              <Alert color={feedback.tone === "error" ? "red" : "teal"}>
                {feedback.message}
              </Alert>
            ) : null}

            <Paper withBorder p="md">
              <Group gap="sm" mb="sm">
                <CalendarClock size={16} />
                <Text fw={600} size="sm">
                  Time
                </Text>
              </Group>
              <Text size="sm">{formatDay(selectedEvent.startsAt, churchTimeZone)}</Text>
              <Text size="sm" c="dimmed" mt={4}>
                {formatTimeRange(selectedEvent.startsAt, selectedEvent.endsAt, churchTimeZone)}
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
                Your RSVP:{" "}
                {selectedEvent.viewerRsvpStatus
                  ? formatCategory(selectedEvent.viewerRsvpStatus)
                  : "Not answered"}
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
                <form onSubmit={handleRsvpSubmit}>
                  <input type="hidden" name="eventId" value={selectedEvent.id} />
                  <Stack gap="sm">
                    <Textarea name="note" label="Note (optional)" minRows={2} />
                    <Group gap="xs" wrap="wrap">
                      <Button
                        type="submit"
                        name="status"
                        value="yes"
                        size="xs"
                        radius="xl"
                        loading={isPending && pendingAction === "rsvp"}
                      >
                        Yes
                      </Button>
                      <Button
                        type="submit"
                        name="status"
                        value="maybe"
                        size="xs"
                        radius="xl"
                        variant="default"
                        loading={isPending && pendingAction === "rsvp"}
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
                        loading={isPending && pendingAction === "rsvp"}
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
                {canOpenEventWorkspace ? (
                  <Group justify="space-between" align="center" mb="sm">
                    <Text fw={600} size="sm">
                      Event workspace
                    </Text>
                    <Button
                      component={Link}
                      href={`/app/church-admin/events/${selectedEvent.id}`}
                      size="xs"
                      variant="default"
                    >
                      Open check-in
                    </Button>
                  </Group>
                ) : null}

                <Text fw={600} size="sm" mb="sm">
                  Edit event
                </Text>
                <form onSubmit={handleUpdateSubmit}>
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
                      <Button
                        type="submit"
                        size="xs"
                        radius="xl"
                        loading={isPending && pendingAction === "update"}
                      >
                        Save changes
                      </Button>
                      <Button
                        type="button"
                        size="xs"
                        radius="xl"
                        color="red"
                        variant="light"
                        loading={isPending && pendingAction === "delete"}
                        onClick={() => handleDelete(selectedEvent.id)}
                      >
                        Delete event
                      </Button>
                    </Group>
                  </Stack>
                </form>
              </Paper>
            ) : null}
          </Stack>
        ) : selectedDateKey ? (
          <Stack gap="md">
            <Paper withBorder p="md">
              <Text fw={600} size="sm" mb="xs">
                Day summary
              </Text>
              <Text size="sm" c="dimmed">
                {selectedDayEvents.length
                  ? `${selectedDayEvents.length} event${selectedDayEvents.length === 1 ? "" : "s"} on this day.`
                  : "No events scheduled for this day."}
              </Text>
            </Paper>

            {selectedDayEvents.length ? (
              selectedDayEvents.map((calendarEvent) => (
                <Paper key={calendarEvent.id} withBorder p="md">
                  <Group justify="space-between" align="flex-start" mb="xs">
                    <div>
                      <Text fw={600}>{calendarEvent.title}</Text>
                      <Text size="sm" c="dimmed" mt={4}>
                        {formatTimeRange(
                          calendarEvent.startsAt,
                          calendarEvent.endsAt,
                          churchTimeZone,
                        )}
                        {calendarEvent.location ? ` • ${calendarEvent.location}` : ""}
                      </Text>
                    </div>
                    <Badge color="blue" variant="light">
                      {formatCategory(calendarEvent.category)}
                    </Badge>
                  </Group>
                  <Group justify="flex-end">
                    <Button size="xs" variant="subtle" onClick={() => openEvent(calendarEvent)}>
                      Open event
                    </Button>
                  </Group>
                </Paper>
              ))
            ) : null}
          </Stack>
        ) : null}
      </Drawer>
    </>
  );
}
