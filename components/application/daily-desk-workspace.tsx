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
import { useI18n } from "@/components/i18n-provider";
import type { ChurchAppSession } from "@/lib/auth";
import type { DailyDeskData, DailyDeskWorkItem } from "@/lib/daily-desk-data";

const typeIcons: Record<string, React.ComponentType<{ size?: number }>> = {
  call: PhoneCall,
  note: NotebookPen,
  visit: UserRoundCheck,
  calendar_item: CalendarClock,
  follow_up: ClipboardList,
  checkup: CheckCircle2,
};

const itemTypeTranslationKeys: Record<string, string> = {
  call: "call",
  note: "note",
  visit: "visit",
  calendar_item: "calendarItem",
  follow_up: "followUp",
  checkup: "checkup",
};

const priorityTranslationKeys: Record<string, string> = {
  normal: "normal",
  high: "high",
  urgent: "urgent",
  low: "low",
};

const statusTranslationKeys: Record<string, string> = {
  open: "open",
  scheduled: "scheduled",
  waiting: "waiting",
  done: "done",
  cancelled: "cancelled",
};

function formatDateTime(value: string | null, locale: string) {
  if (!value) return null;
  return new Intl.DateTimeFormat(locale === "es" ? "es-US" : "en-US", {
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
  locale,
  t,
}: {
  item: DailyDeskWorkItem;
  onStatus: (itemId: string, status: "waiting" | "done" | "cancelled") => void;
  busy: boolean;
  locale: string;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  const Icon = typeIcons[item.itemType] ?? typeIcons.note;
  const typeLabel = t(itemTypeTranslationKeys[item.itemType] ?? "note");
  const priorityLabel = t(priorityTranslationKeys[item.priority] ?? "normal");
  const statusLabel = t(statusTranslationKeys[item.status] ?? "open");
  const when = formatDateTime(item.dueAt, locale) ?? formatDateTime(item.scheduledAt, locale);

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
                  {typeLabel}
                </Badge>
                <Badge color={priorityColor(item.priority)} variant="light">
                  {priorityLabel}
                </Badge>
                <Badge color="gray" variant="outline">
                  {statusLabel}
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
              {t("assignedToPrefix", { name: item.assignedToName })}
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
              {t("done")}
            </Button>
            <Button
              size="xs"
              radius="xl"
              variant="default"
              disabled={busy}
              onClick={() => onStatus(item.id, "waiting")}
            >
              {t("waiting")}
            </Button>
            <Button
              size="xs"
              radius="xl"
              variant="subtle"
              color="gray"
              disabled={busy}
              onClick={() => onStatus(item.id, "cancelled")}
            >
              {t("cancel")}
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
  const { locale, t: translate } = useI18n();
  const t = (key: string, values?: Record<string, string | number>) =>
    translate("dailyDesk", key, values);
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
  const itemTypeOptions = [
    { value: "call", label: t("call") },
    { value: "note", label: t("note") },
    { value: "visit", label: t("visit") },
    { value: "calendar_item", label: t("calendarItem") },
    { value: "follow_up", label: t("followUp") },
    { value: "checkup", label: t("checkup") },
  ];
  const priorityOptions = [
    { value: "normal", label: t("normal") },
    { value: "high", label: t("high") },
    { value: "urgent", label: t("urgent") },
    { value: "low", label: t("low") },
  ];
  const isPastor = session.appContext.roleId === "pastor";
  const isSecretary = session.appContext.roleId === "secretary";
  const homeHref = isPastor ? "/app/pastor" : isSecretary ? "/app/secretary" : "/app/church-admin";
  const navItems = [
    {
      href: homeHref,
      label: t("home"),
      description: session.appContext.church.name,
      icon: isPastor ? UserRoundCheck : isSecretary ? PhoneCall : ClipboardList,
    },
    {
      href: "/app/daily-desk",
      label: t("dailyDesk"),
      description: t("callsAndFollowUp"),
      icon: PhoneCall,
      active: true,
    },
    {
      href: "/app/calendar",
      label: t("calendar"),
      description: t("eventsAndSchedule"),
      icon: CalendarClock,
    },
  ];

  if (!isSecretary) {
    navItems.splice(2, 0, {
      href: "/app/church-admin/readiness",
      label: t("readiness"),
      description: t("weeklyLaunchPath"),
      icon: ClipboardList,
    });
  }

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
      setMessage(t("saved"));
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("couldNotSave"));
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
      setMessage(error instanceof Error ? error.message : t("couldNotUpdate"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ApplicationShell
      session={session}
      workspaceHref={homeHref}
      calendarHref="/app/calendar"
      sectionLabel={t("dailyDesk")}
      title={t("dailyDesk")}
      description={session.appContext.church.name}
      sidebarTitle={t("dailyOperations")}
      sidebarDescription={t("deskDescription")}
      navLabel={t("dailyWork")}
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
                  {t("captureWork")}
                </Title>
                <Text size="sm" c="dimmed">
                  {t("captureDescription")}
                </Text>
              </div>
            </Group>

            <form onSubmit={handleCreate}>
              <Stack gap="sm">
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                  <Select
                    label={t("type")}
                    data={itemTypeOptions}
                    value={itemType}
                    onChange={(value) => setItemType((value ?? "call") as CreateDailyWorkItemInput["itemType"])}
                  />
                  <Select
                    label={t("priority")}
                    data={priorityOptions}
                    value={priority}
                    onChange={(value) => setPriority((value ?? "normal") as CreateDailyWorkItemInput["priority"])}
                  />
                </SimpleGrid>
                <TextInput name="title" label={t("title")} placeholder={t("titlePlaceholder")} required />
                <Textarea name="body" label={t("notes")} placeholder={t("notesPlaceholder")} rows={3} />
                {itemType === "call" ? (
                  <Select
                    label={t("direction")}
                    data={[
                      { value: "incoming", label: t("incoming") },
                      { value: "outgoing", label: t("outgoing") },
                    ]}
                    value={direction}
                    onChange={(value) => setDirection((value ?? "incoming") as "incoming" | "outgoing")}
                  />
                ) : null}
                <Select
                  label={t("person")}
                  data={peopleOptions}
                  value={relatedProfileId}
                  onChange={setRelatedProfileId}
                  searchable
                  clearable
                  placeholder={t("connectToProfile")}
                />
                <Select
                  label={t("assignedTo")}
                  data={peopleOptions}
                  value={assignedToProfileId}
                  onChange={setAssignedToProfileId}
                  searchable
                  clearable
                  placeholder={t("officePastorLeader")}
                />
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                  <TextInput name="scheduledAt" type="datetime-local" label={t("scheduled")} />
                  <TextInput name="dueAt" type="datetime-local" label={t("due")} />
                </SimpleGrid>
                <TextInput name="location" label={t("location")} placeholder={t("locationPlaceholder")} />
                {message ? (
                  <Text size="sm" c={message === t("saved") ? "teal" : "red"}>
                    {message}
                  </Text>
                ) : null}
                <Button type="submit" radius="xl" leftSection={<Plus size={16} />} loading={busy}>
                  {t("addToDesk")}
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
                  {data.source === "live" ? t("liveTenantData") : t("preview")}
                </Badge>
                <Title order={1}>{t("todayWork")}</Title>
                <Text c="dimmed" mt="xs">
                  {t("singleSurface")}
                </Text>
              </div>
              <Button component="a" href="/app/calendar" radius="xl" variant="default">
                {t("calendar")}
              </Button>
            </Group>

            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
              <Paper withBorder radius="lg" p="md">
                <Text size="xs" tt="uppercase" fw={700} c="dimmed">
                  {t("dueToday")}
                </Text>
                <Title order={2}>{data.today.length}</Title>
              </Paper>
              <Paper withBorder radius="lg" p="md">
                <Text size="xs" tt="uppercase" fw={700} c="dimmed">
                  {t("inbox")}
                </Text>
                <Title order={2}>{data.inbox.length}</Title>
              </Paper>
              <Paper withBorder radius="lg" p="md">
                <Text size="xs" tt="uppercase" fw={700} c="dimmed">
                  {t("doneToday")}
                </Text>
                <Title order={2}>{data.completedToday.length}</Title>
              </Paper>
            </SimpleGrid>

            <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="md">
              <Stack gap="sm">
                <Title order={3} size="h4">
                  {t("dueTodayHeading")}
                </Title>
                {data.today.length ? (
                  data.today.map((item) => (
                    <WorkItemCard key={item.id} item={item} onStatus={handleStatus} busy={busy} locale={locale} t={t} />
                  ))
                ) : (
                  <Text size="sm" c="dimmed">
                    {t("noToday")}
                  </Text>
                )}
              </Stack>

              <Stack gap="sm">
                <Title order={3} size="h4">
                  {t("inbox")}
                </Title>
                {data.inbox.length ? (
                  data.inbox.map((item) => (
                    <WorkItemCard key={item.id} item={item} onStatus={handleStatus} busy={busy} locale={locale} t={t} />
                  ))
                ) : (
                  <Text size="sm" c="dimmed">
                    {t("noInbox")}
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
              {t("watchlist")}
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
              {t("next48Hours")}
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
                        {formatDateTime(event.startsAt, locale)}
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
                {t("noEventsNext48")}
              </Text>
            )}
          </Stack>
        </Paper>
      </SimpleGrid>
    </ApplicationShell>
  );
}
