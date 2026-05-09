"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Clock3,
  MapPin,
  NotebookPen,
  PhoneCall,
  Plus,
  UserRoundCheck,
} from "lucide-react";
import {
  Badge,
  Button,
  Grid,
  Group,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
  ThemeIcon,
  Title,
} from "@mantine/core";

import {
  createDailyWorkItemAction,
  updateDailyWorkItemStatusAction,
  type CreateDailyWorkItemInput,
} from "@/app/app/daily-desk-actions";
import { ApplicationShell } from "@/components/application/app-shell";
import { ChurchAppContextBanner } from "@/components/application/church-app-context-banner";
import type { ChurchAppSession } from "@/lib/auth";
import type { DailyDeskData, DailyDeskWorkItem } from "@/lib/daily-desk-data";

const itemTypeOptions = [
  { value: "call", label: "Call" },
  { value: "note", label: "Note" },
  { value: "visit", label: "Visit" },
  { value: "calendar_item", label: "Calendar item" },
  { value: "follow_up", label: "Follow-up" },
  { value: "checkup", label: "Checkup" },
];

const priorityOptions = [
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
  { value: "low", label: "Low" },
];

const typeMeta: Record<string, { label: string; icon: React.ComponentType<{ size?: number }> }> = {
  call: { label: "Call", icon: PhoneCall },
  note: { label: "Note", icon: NotebookPen },
  visit: { label: "Visit", icon: UserRoundCheck },
  calendar_item: { label: "Calendar", icon: CalendarClock },
  follow_up: { label: "Follow-up", icon: ClipboardList },
  checkup: { label: "Checkup", icon: CheckCircle2 },
};

function formatDateTime(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function priorityColor(priority: string) {
  if (priority === "urgent") return "red";
  if (priority === "high") return "orange";
  if (priority === "low") return "gray";
  return "blue";
}

function signalColor(severity: string) {
  if (severity === "urgent") return "red";
  if (severity === "attention") return "yellow";
  return "teal";
}

function WorkItemCard({
  item,
  onStatus,
  busy,
}: {
  item: DailyDeskWorkItem;
  onStatus: (itemId: string, status: "waiting" | "done" | "cancelled") => void;
  busy: boolean;
}) {
  const meta = typeMeta[item.itemType] ?? typeMeta.note;
  const Icon = meta.icon;
  const when = formatDateTime(item.dueAt) ?? formatDateTime(item.scheduledAt);

  return (
    <Paper withBorder radius="lg" p="md">
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start" gap="sm">
          <Group gap="sm" align="flex-start">
            <ThemeIcon color="gray" variant="light" radius="xl">
              <Icon size={16} />
            </ThemeIcon>
            <div>
              <Text fw={700}>{item.title}</Text>
              <Group gap={6} mt={6}>
                <Badge color="gray" variant="light">
                  {meta.label}
                </Badge>
                <Badge color={priorityColor(item.priority)} variant="light">
                  {item.priority}
                </Badge>
                <Badge color="gray" variant="outline">
                  {item.status}
                </Badge>
              </Group>
            </div>
          </Group>
        </Group>

        {item.body ? (
          <Text size="sm" c="dimmed">
            {item.body}
          </Text>
        ) : null}

        <Group gap="xs">
          {item.relatedProfileName ? (
            <Text size="sm">{item.relatedProfileName}</Text>
          ) : null}
          {item.assignedToName ? (
            <Text size="sm" c="dimmed">
              Assigned to {item.assignedToName}
            </Text>
          ) : null}
        </Group>

        <Group gap="md">
          {when ? (
            <Group gap={6}>
              <Clock3 size={14} />
              <Text size="sm">{when}</Text>
            </Group>
          ) : null}
          {item.location ? (
            <Group gap={6}>
              <MapPin size={14} />
              <Text size="sm">{item.location}</Text>
            </Group>
          ) : null}
        </Group>

        {item.status !== "done" ? (
          <Group gap="xs">
            <Button
              size="xs"
              radius="xl"
              variant="light"
              color="teal"
              disabled={busy}
              onClick={() => onStatus(item.id, "done")}
            >
              Done
            </Button>
            <Button
              size="xs"
              radius="xl"
              variant="default"
              disabled={busy}
              onClick={() => onStatus(item.id, "waiting")}
            >
              Waiting
            </Button>
            <Button
              size="xs"
              radius="xl"
              variant="subtle"
              color="gray"
              disabled={busy}
              onClick={() => onStatus(item.id, "cancelled")}
            >
              Cancel
            </Button>
          </Group>
        ) : null}
      </Stack>
    </Paper>
  );
}

export function DailyDeskWorkspace({
  session,
  data,
}: {
  session: ChurchAppSession;
  data: DailyDeskData;
}) {
  const router = useRouter();
  const [itemType, setItemType] = useState<CreateDailyWorkItemInput["itemType"]>("call");
  const [priority, setPriority] = useState<CreateDailyWorkItemInput["priority"]>("normal");
  const [direction, setDirection] = useState<"incoming" | "outgoing">("incoming");
  const [relatedProfileId, setRelatedProfileId] = useState<string | null>(null);
  const [assignedToProfileId, setAssignedToProfileId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const peopleOptions = useMemo(
    () => data.people.map((person) => ({ value: person.id, label: person.fullName })),
    [data.people],
  );
  const navItems = [
    {
      href: session.appContext.roleId === "pastor" ? "/app/pastor" : "/app/church-admin",
      label: "Home",
      description: session.appContext.church.name,
      icon: session.appContext.roleId === "pastor" ? UserRoundCheck : ClipboardList,
    },
    {
      href: "/app/daily-desk",
      label: "Daily Desk",
      description: "Calls and follow-up",
      icon: PhoneCall,
      active: true,
    },
    {
      href: "/app/church-admin/readiness",
      label: "Readiness",
      description: "Weekly launch path",
      icon: ClipboardList,
    },
    {
      href: "/app/calendar",
      label: "Calendar",
      description: "Events and schedule",
      icon: CalendarClock,
    },
  ];

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage(null);

    try {
      await createDailyWorkItemAction({
        itemType,
        title: String(form.get("title") ?? ""),
        body: String(form.get("body") ?? ""),
        priority,
        direction,
        relatedProfileId,
        assignedToProfileId,
        scheduledAt: String(form.get("scheduledAt") ?? ""),
        dueAt: String(form.get("dueAt") ?? ""),
        location: String(form.get("location") ?? ""),
      });
      event.currentTarget.reset();
      setRelatedProfileId(null);
      setAssignedToProfileId(null);
      setMessage("Daily work item saved.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save the work item.");
    } finally {
      setBusy(false);
    }
  }

  async function handleStatus(itemId: string, status: "waiting" | "done" | "cancelled") {
    setBusy(true);
    setMessage(null);
    try {
      await updateDailyWorkItemStatusAction({ itemId, status });
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update the item.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ApplicationShell
      session={session}
      workspaceHref={session.appContext.roleId === "pastor" ? "/app/pastor" : "/app/church-admin"}
      calendarHref="/app/calendar"
      sectionLabel="Daily Desk"
      title="Daily Desk"
      description={session.appContext.church.name}
      sidebarTitle="Daily operations"
      sidebarDescription="Calls, notes, visits, checks, and next actions."
      navLabel="Daily work"
      navItems={navItems}
    >
      <ChurchAppContextBanner session={session} />

      <Grid gap="lg">
        <Grid.Col span={{ base: 12, lg: 4 }}>
          <Paper withBorder radius="xl" p="xl">
          <Stack gap="md">
            <Group gap="sm">
              <ThemeIcon color="gray" variant="light" radius="xl" size="lg">
                <Plus size={18} />
              </ThemeIcon>
              <div>
                <Title order={2} size="h3">
                  Capture work
                </Title>
                <Text size="sm" c="dimmed">
                  Log the next call, note, visit, calendar item, or checkup.
                </Text>
              </div>
            </Group>

            <form onSubmit={handleCreate}>
              <Stack gap="sm">
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                  <Select
                    label="Type"
                    data={itemTypeOptions}
                    value={itemType}
                    onChange={(value) => setItemType((value ?? "call") as CreateDailyWorkItemInput["itemType"])}
                  />
                  <Select
                    label="Priority"
                    data={priorityOptions}
                    value={priority}
                    onChange={(value) => setPriority((value ?? "normal") as CreateDailyWorkItemInput["priority"])}
                  />
                </SimpleGrid>
                <TextInput name="title" label="Title" placeholder="Return call to visitor" required />
                <Textarea name="body" label="Notes" placeholder="What happened or what needs to happen next?" rows={3} />
                {itemType === "call" ? (
                  <Select
                    label="Direction"
                    data={[
                      { value: "incoming", label: "Incoming" },
                      { value: "outgoing", label: "Outgoing" },
                    ]}
                    value={direction}
                    onChange={(value) => setDirection((value ?? "incoming") as "incoming" | "outgoing")}
                  />
                ) : null}
                <Select
                  label="Person"
                  data={peopleOptions}
                  value={relatedProfileId}
                  onChange={setRelatedProfileId}
                  searchable
                  clearable
                  placeholder="Connect to a profile"
                />
                <Select
                  label="Assigned to"
                  data={peopleOptions}
                  value={assignedToProfileId}
                  onChange={setAssignedToProfileId}
                  searchable
                  clearable
                  placeholder="Office, pastor, or leader"
                />
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                  <TextInput name="scheduledAt" type="datetime-local" label="Scheduled" />
                  <TextInput name="dueAt" type="datetime-local" label="Due" />
                </SimpleGrid>
                <TextInput name="location" label="Location" placeholder="Office, hospital, home, phone" />
                {message ? (
                  <Text size="sm" c={message.includes("Could not") || message.includes("required") ? "red" : "teal"}>
                    {message}
                  </Text>
                ) : null}
                <Button type="submit" radius="xl" leftSection={<Plus size={16} />} loading={busy}>
                  Add to desk
                </Button>
              </Stack>
            </form>
          </Stack>
          </Paper>
        </Grid.Col>

        <Grid.Col span={{ base: 12, lg: 8 }}>
          <Paper withBorder radius="xl" p="xl">
          <Stack gap="lg">
            <Group justify="space-between" align="flex-start">
              <div>
                <Badge color={data.source === "live" ? "teal" : "gray"} variant="light" mb="sm">
                  {data.source === "live" ? "Live tenant data" : "Preview"}
                </Badge>
                <Title order={1}>Today&apos;s work</Title>
                <Text c="dimmed" mt="xs">
                  A single working surface for the church office and pastoral follow-up.
                </Text>
              </div>
              <Button component="a" href="/app/calendar" radius="xl" variant="default">
                Calendar
              </Button>
            </Group>

            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
              <Paper withBorder radius="lg" p="md">
                <Text size="xs" tt="uppercase" fw={700} c="dimmed">
                  Due Today
                </Text>
                <Title order={2}>{data.today.length}</Title>
              </Paper>
              <Paper withBorder radius="lg" p="md">
                <Text size="xs" tt="uppercase" fw={700} c="dimmed">
                  Inbox
                </Text>
                <Title order={2}>{data.inbox.length}</Title>
              </Paper>
              <Paper withBorder radius="lg" p="md">
                <Text size="xs" tt="uppercase" fw={700} c="dimmed">
                  Done Today
                </Text>
                <Title order={2}>{data.completedToday.length}</Title>
              </Paper>
            </SimpleGrid>

            <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="md">
              <Stack gap="sm">
                <Title order={3} size="h4">
                  Due today
                </Title>
                {data.today.length ? (
                  data.today.map((item) => (
                    <WorkItemCard key={item.id} item={item} onStatus={handleStatus} busy={busy} />
                  ))
                ) : (
                  <Text size="sm" c="dimmed">
                    No daily work is scheduled or due today.
                  </Text>
                )}
              </Stack>

              <Stack gap="sm">
                <Title order={3} size="h4">
                  Inbox
                </Title>
                {data.inbox.length ? (
                  data.inbox.map((item) => (
                    <WorkItemCard key={item.id} item={item} onStatus={handleStatus} busy={busy} />
                  ))
                ) : (
                  <Text size="sm" c="dimmed">
                    No unscheduled work is waiting in the inbox.
                  </Text>
                )}
              </Stack>
            </SimpleGrid>
          </Stack>
          </Paper>
        </Grid.Col>
      </Grid>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
        <Paper withBorder radius="xl" p="xl">
          <Group gap="sm" mb="lg">
            <ThemeIcon color="gray" variant="light" radius="xl" size="lg">
              <AlertTriangle size={18} />
            </ThemeIcon>
            <Title order={3} size="h4">
              Watchlist
            </Title>
          </Group>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            {data.signals.map((signal) => (
              <Paper key={signal.id} component="a" href={signal.href} withBorder radius="lg" p="md" style={{ textDecoration: "none" }}>
                <Group justify="space-between" align="flex-start">
                  <div>
                    <Text fw={700}>{signal.label}</Text>
                    <Text size="sm" c="dimmed" mt={4}>
                      {signal.detail}
                    </Text>
                  </div>
                  <Badge color={signalColor(signal.severity)} variant="light">
                    {signal.value}
                  </Badge>
                </Group>
              </Paper>
            ))}
          </SimpleGrid>
        </Paper>

        <Paper withBorder radius="xl" p="xl">
          <Group gap="sm" mb="lg">
            <ThemeIcon color="gray" variant="light" radius="xl" size="lg">
              <CalendarClock size={18} />
            </ThemeIcon>
            <Title order={3} size="h4">
              Next 48 hours
            </Title>
          </Group>
          <Stack gap="sm">
            {data.events.length ? (
              data.events.map((event) => (
                <Paper key={event.id} component="a" href={`/app/church-admin/events/${event.id}`} withBorder radius="lg" p="md" style={{ textDecoration: "none" }}>
                  <Group justify="space-between" align="flex-start" gap="md">
                    <div>
                      <Text fw={700}>{event.title}</Text>
                      <Text size="sm" c="dimmed" mt={4}>
                        {formatDateTime(event.startsAt)}
                      </Text>
                    </div>
                    {event.location ? (
                      <Badge color="gray" variant="light">
                        {event.location}
                      </Badge>
                    ) : null}
                  </Group>
                </Paper>
              ))
            ) : (
              <Text size="sm" c="dimmed">
                No events are scheduled in the next 48 hours.
              </Text>
            )}
          </Stack>
        </Paper>
      </SimpleGrid>
    </ApplicationShell>
  );
}
