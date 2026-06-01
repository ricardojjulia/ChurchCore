"use client";

import { useMemo, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  BellRing,
  CalendarRange,
  ClipboardList,
  DollarSign,
  HeartHandshake,
  MailCheck,
  Search,
  Sparkles,
  UserPlus,
  Users,
  UsersRound,
} from "lucide-react";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";

import {
  addRosterAssignmentAction,
  quickAddVisitorCheckInAction,
  quickCheckInEventMemberAction,
  removeRosterAssignmentAction,
  toggleRosterConfirmationAction,
} from "@/app/app/church-admin-actions";
import { ApplicationShell } from "@/components/application/app-shell";
import { ChurchAppContextBanner } from "@/components/application/church-app-context-banner";
import { ReadinessTargetState } from "@/components/application/readiness-target-state";
import type { ChurchAppSession } from "@/lib/auth";
import Link from "next/link";
import { Table, Tabs } from "@mantine/core";
import { Calendar, ChevronRight, Plus } from "lucide-react";
import type {
  ChurchAdminEventWorkspaceData,
  ChurchAdminEventsListEntry,
} from "@/lib/church-admin-events-data";
import { createEventAction } from "@/app/app/church-admin-actions";

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function ChurchAdminEventWorkspace({
  session,
  data,
  embedded = false,
}: {
  session: ChurchAppSession;
  data: ChurchAdminEventWorkspaceData;
  embedded?: boolean;
}) {
  const [rosterQuery, setRosterQuery] = useState("");
  const [attendanceQuery, setAttendanceQuery] = useState("");
  const [attendanceSourceFilter, setAttendanceSourceFilter] = useState("all");
  const [roleTitle, setRoleTitle] = useState("Usher");
  const [opened, { open, close }] = useDisclosure(false);
  const [visitorName, setVisitorName] = useState("");
  const [visitorEmail, setVisitorEmail] = useState("");
  const [visitorPhone, setVisitorPhone] = useState("");
  const [isPending, startTransition] = useTransition();

  const rosterCandidates = useMemo(() => {
    const selected = new Set(data.rosterEntries.map((entry) => entry.profileId));
    const normalized = rosterQuery.trim().toLowerCase();

    return data.people
      .filter((person) => person.isRosterEligible && !selected.has(person.id))
      .filter((person) => {
        if (!normalized) {
          return true;
        }

        return [
          person.fullName,
          person.memberNumber,
          person.email,
          person.phone,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalized);
      })
      .slice(0, 12);
  }, [data.people, data.rosterEntries, rosterQuery]);

  const attendanceCandidates = useMemo(() => {
    const checkedIn = new Set(
      data.attendanceEntries
        .filter((entry) => entry.status === "present")
        .map((entry) => entry.profileId),
    );
    const normalized = attendanceQuery.trim().toLowerCase();

    return data.people
      .filter((person) => !checkedIn.has(person.id))
      .filter((person) => {
        if (!normalized) {
          return true;
        }

        return [
          person.fullName,
          person.memberNumber,
          person.email,
          person.phone,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalized);
      })
      .slice(0, 16);
  }, [attendanceQuery, data.attendanceEntries, data.people]);

  const attendanceSourceCounts = useMemo(() => {
    return data.attendanceEntries.reduce((acc, entry) => {
      const source = entry.checkInMethod || "unknown";
      acc.set(source, (acc.get(source) ?? 0) + 1);
      return acc;
    }, new Map<string, number>());
  }, [data.attendanceEntries]);

  const attendanceLogEntries = useMemo(() => {
    if (attendanceSourceFilter === "all") {
      return data.attendanceEntries;
    }

    return data.attendanceEntries.filter(
      (entry) => entry.checkInMethod === attendanceSourceFilter,
    );
  }, [attendanceSourceFilter, data.attendanceEntries]);

  const mobileMemberAudit = useMemo(() => {
    const mobileEntries = data.attendanceEntries.filter(
      (entry) => entry.checkInMethod === "mobile_member",
    );
    const uniqueHouseholds = new Set(
      mobileEntries.map((entry) => entry.familyName ?? `profile:${entry.profileId}`),
    );

    return {
      mobileEntries,
      householdCount: uniqueHouseholds.size,
    };
  }, [data.attendanceEntries]);

  function formatCheckInSource(value: string) {
    if (value === "mobile_member") return "mobile member";
    if (value === "manual_admin") return "manual admin";
    if (value === "self_checkin") return "self check-in";
    if (value === "nfc_qr") return "nfc / qr";
    return value.replaceAll("_", " ");
  }

  function sourceBadgeColor(value: string) {
    if (value === "mobile_member") return "indigo";
    if (value === "staff") return "blue";
    if (value === "kiosk") return "teal";
    if (value === "import") return "grape";
    return "gray";
  }

  function runTask(task: () => Promise<void>, successMessage: string, failureTitle: string) {
    startTransition(async () => {
      try {
        await task();
        notifications.show({
          title: "Updated",
          message: successMessage,
          color: "teal",
        });
      } catch (error) {
        notifications.show({
          title: failureTitle,
          message: error instanceof Error ? error.message : "The action could not be completed.",
          color: "red",
        });
      }
    });
  }

  function handleAddRoster(profileId: string, fullName: string) {
    runTask(
      () =>
        addRosterAssignmentAction({
          eventId: data.event.id,
          profileId,
          roleTitle,
        }).then(() => undefined),
      `${fullName} was added to the roster.`,
      "Roster update failed",
    );
  }

  function handleQuickCheckIn(profileId: string, fullName: string) {
    runTask(
      () =>
        quickCheckInEventMemberAction({
          eventId: data.event.id,
          profileId,
        }).then(() => undefined),
      `${fullName} was checked in.`,
      "Check-in failed",
    );
  }

  function handleQuickAddVisitor() {
    runTask(
      () =>
        quickAddVisitorCheckInAction({
          eventId: data.event.id,
          fullName: visitorName,
          email: visitorEmail || null,
          phone: visitorPhone || null,
        }).then(() => {
          setVisitorName("");
          setVisitorEmail("");
          setVisitorPhone("");
          close();
        }),
      `${visitorName.trim()} was added and checked in.`,
      "Visitor check-in failed",
    );
  }

  const innerContent = (
    <>
      <ChurchAppContextBanner session={session} />

      <SimpleGrid cols={{ base: 1, md: 4 }} spacing="md">
        <Paper withBorder radius="xl" p="lg">
          <Text size="xs" tt="uppercase" fw={700} c="dimmed">
            Roster
          </Text>
          <Title order={3} mt="xs">
            {data.stats.rosterCount}
          </Title>
        </Paper>
        <Paper withBorder radius="xl" p="lg">
          <Text size="xs" tt="uppercase" fw={700} c="dimmed">
            Checked in
          </Text>
          <Title order={3} mt="xs">
            {data.stats.attendanceCount}
          </Title>
        </Paper>
        <Paper withBorder radius="xl" p="lg">
          <Text size="xs" tt="uppercase" fw={700} c="dimmed">
            Pending confirm
          </Text>
          <Title order={3} mt="xs">
            {data.stats.pendingConfirmations}
          </Title>
        </Paper>
        <Paper withBorder radius="xl" p="lg">
          <Text size="xs" tt="uppercase" fw={700} c="dimmed">
            Burnout watch
          </Text>
          <Title order={3} mt="xs">
            {data.stats.burnoutWarnings}
          </Title>
        </Paper>
      </SimpleGrid>

      <Paper withBorder radius="xl" p="xl">
        <Group justify="space-between" align="flex-start" gap="md">
          <div>
            <Title order={3} size="h4">
              Event snapshot
            </Title>
            <Text size="sm" c="dimmed" mt="sm">
              {formatDateTime(data.event.startsAt)} • {data.event.category}
              {data.event.location ? ` • ${data.event.location}` : ""}
            </Text>
            {data.event.description ? (
              <Text size="sm" mt="sm">
                {data.event.description}
              </Text>
            ) : null}
          </div>
          <Badge color="gray" variant="light">
            {data.event.approvalStatus}
          </Badge>
        </Group>
      </Paper>

      {data.carePrompts.length ? (
        <Alert
          color="violet"
          variant="light"
          radius="xl"
          icon={<AlertTriangle size={16} />}
          title="Care follow-up prompts"
        >
          <Stack gap="xs">
            {data.carePrompts.map((prompt) => (
              <Text key={prompt.profileId} size="sm">
                {prompt.fullName}: {prompt.detail}
              </Text>
            ))}
            <Text size="xs" c="dimmed">
              {data.aiDisclaimer}
            </Text>
          </Stack>
        </Alert>
      ) : null}

      <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="lg">
        <Paper withBorder radius="xl" p="xl">
          <Group justify="space-between" align="center" mb="lg">
            <div>
              <Title order={3} size="h4">
                Roster manager
              </Title>
              <Text size="sm" c="dimmed">
                Add roster-eligible people and watch for heavy 7-day load.
              </Text>
            </div>
          </Group>

          <Group grow align="flex-end" mb="lg">
            <TextInput
              value={rosterQuery}
              onChange={(event) => setRosterQuery(event.currentTarget.value)}
              placeholder="Search by name, member number, or email"
              leftSection={<Search size={16} />}
              radius="xl"
            />
            <TextInput
              value={roleTitle}
              onChange={(event) => setRoleTitle(event.currentTarget.value)}
              label="Role title"
              radius="xl"
            />
          </Group>

          <Stack gap="sm" mb="xl">
            {rosterCandidates.length ? (
              rosterCandidates.map((person) => (
                <Paper key={person.id} withBorder radius="xl" p="lg">
                  <Group justify="space-between" align="flex-start" gap="md">
                    <Stack gap={4}>
                      <Group gap="xs" wrap="wrap">
                        <Text fw={600}>{person.fullName}</Text>
                        {person.memberNumber ? (
                          <Badge color="gray" variant="light">
                            {person.memberNumber}
                          </Badge>
                        ) : null}
                        {person.sevenDayLoad > 3 ? (
                          <Badge color="yellow" variant="light">
                            {person.sevenDayLoad} assignments in 7 days
                          </Badge>
                        ) : null}
                      </Group>
                      <Text size="sm" c="dimmed">
                        {person.email || person.phone || "No contact details on file."}
                      </Text>
                      <Text size="xs" c="dimmed">
                        Account status: {person.accountStatus}
                      </Text>
                    </Stack>
                    <Button
                      onClick={() => handleAddRoster(person.id, person.fullName)}
                      loading={isPending}
                    >
                      Add
                    </Button>
                  </Group>
                </Paper>
              ))
            ) : (
              <Text size="sm" c="dimmed">
                No matching roster candidates.
              </Text>
            )}
          </Stack>

          <Title order={4} size="h5" mb="sm">
            Current roster
          </Title>
          <Stack gap="sm">
            {data.rosterEntries.length ? (
              data.rosterEntries.map((entry) => (
                <Paper key={entry.id} withBorder radius="xl" p="lg">
                  <Group justify="space-between" align="flex-start" gap="md">
                    <Stack gap={4}>
                      <Group gap="xs" wrap="wrap">
                        <Text fw={600}>{entry.fullName}</Text>
                        <Badge color="gray" variant="light">
                          {entry.roleTitle}
                        </Badge>
                        {entry.sevenDayLoad > 3 ? (
                          <Badge color="yellow" variant="light">
                            Burnout watch
                          </Badge>
                        ) : null}
                      </Group>
                      <Text size="sm" c="dimmed">
                        {entry.phone || entry.memberNumber || "No member number or phone on file."}
                      </Text>
                    </Stack>
                    <Group gap="sm">
                      <Button
                        variant="default"
                        onClick={() =>
                          runTask(
                            () =>
                              toggleRosterConfirmationAction({
                                eventId: data.event.id,
                                rosterId: entry.id,
                                isConfirmed: !entry.isConfirmed,
                              }).then(() => undefined),
                            entry.isConfirmed
                              ? `${entry.fullName} is now unconfirmed.`
                              : `${entry.fullName} is now confirmed.`,
                            "Confirmation update failed",
                          )
                        }
                        loading={isPending}
                      >
                        {entry.isConfirmed ? "Unconfirm" : "Confirm"}
                      </Button>
                      <Button
                        color="red"
                        variant="light"
                        onClick={() =>
                          runTask(
                            () =>
                              removeRosterAssignmentAction({
                                eventId: data.event.id,
                                rosterId: entry.id,
                              }).then(() => undefined),
                            `${entry.fullName} was removed from the roster.`,
                            "Roster removal failed",
                          )
                        }
                        loading={isPending}
                      >
                        Remove
                      </Button>
                    </Group>
                  </Group>
                </Paper>
              ))
            ) : (
              <Text size="sm" c="dimmed">
                No roster assignments yet.
              </Text>
            )}
          </Stack>
        </Paper>

        <Paper withBorder radius="xl" p="xl" id="attendance-tracker">
          <Group justify="space-between" align="center" mb="lg">
            <div>
              <Title order={3} size="h4">
                Attendance tracker
              </Title>
              <Text size="sm" c="dimmed">
                Quick-check members into the event and review the attendance log.
              </Text>
            </div>
          </Group>

          <TextInput
            value={attendanceQuery}
            onChange={(event) => setAttendanceQuery(event.currentTarget.value)}
            placeholder="Search by name, member number, or email"
            leftSection={<Search size={16} />}
            radius="xl"
            mb="lg"
          />

          <Stack gap="sm" mb="xl">
            {attendanceCandidates.length ? (
              attendanceCandidates.map((person) => (
                <Paper key={person.id} withBorder radius="xl" p="lg">
                  <Group justify="space-between" align="flex-start" gap="md">
                    <Stack gap={4}>
                      <Group gap="xs" wrap="wrap">
                        <Text fw={600}>{person.fullName}</Text>
                        {person.memberNumber ? (
                          <Badge color="gray" variant="light">
                            {person.memberNumber}
                          </Badge>
                        ) : null}
                      </Group>
                      <Text size="sm" c="dimmed">
                        {person.email || person.phone || "No contact details on file."}
                      </Text>
                    </Stack>
                    <Button
                      onClick={() => handleQuickCheckIn(person.id, person.fullName)}
                      loading={isPending}
                    >
                      Check in
                    </Button>
                  </Group>
                </Paper>
              ))
            ) : (
              <Text size="sm" c="dimmed">
                Everyone in the current result set is already checked in.
              </Text>
            )}
          </Stack>

          <Title order={4} size="h5" mb="sm">
            Attendance log
          </Title>

          <Paper withBorder radius="lg" p="md" mb="sm">
            <Group justify="space-between" align="flex-start" gap="md">
              <Stack gap={2}>
                <Text fw={600} size="sm">
                  Mobile member audit
                </Text>
                <Text size="xs" c="dimmed">
                  Tracks self-check-ins and household participation for policy review.
                </Text>
              </Stack>
              <Group gap="xs">
                <Badge color="indigo" variant="light">
                  mobile self-check-ins {mobileMemberAudit.mobileEntries.length}
                </Badge>
                <Badge color="gray" variant="light">
                  households {mobileMemberAudit.householdCount}
                </Badge>
              </Group>
            </Group>
          </Paper>

          <Group gap="xs" mb="sm">
            <Button
              size="xs"
              variant={attendanceSourceFilter === "all" ? "filled" : "light"}
              onClick={() => setAttendanceSourceFilter("all")}
            >
              All ({data.attendanceEntries.length})
            </Button>
            {Array.from(attendanceSourceCounts.entries()).map(([source, count]) => (
              <Button
                key={source}
                size="xs"
                variant={attendanceSourceFilter === source ? "filled" : "light"}
                onClick={() => setAttendanceSourceFilter(source)}
              >
                {formatCheckInSource(source)} ({count})
              </Button>
            ))}
          </Group>
          <Stack gap="sm">
            {attendanceLogEntries.length ? (
              attendanceLogEntries.map((entry) => (
                <Paper key={entry.id} withBorder radius="xl" p="lg">
                  <Group justify="space-between" align="flex-start" gap="md">
                    <Stack gap={4}>
                      <Group gap="xs" wrap="wrap">
                        <Text fw={600}>{entry.fullName}</Text>
                        {entry.memberNumber ? (
                          <Badge color="gray" variant="light">
                            {entry.memberNumber}
                          </Badge>
                        ) : null}
                      </Group>
                      <Text size="sm" c="dimmed">
                        {formatDateTime(entry.checkedInAt)}
                      </Text>
                    </Stack>
                    <Group gap="xs">
                      <Badge color={sourceBadgeColor(entry.checkInMethod)} variant="light">
                        {formatCheckInSource(entry.checkInMethod)}
                      </Badge>
                      <Badge color="teal" variant="light">
                        {entry.status}
                      </Badge>
                    </Group>
                  </Group>
                </Paper>
              ))
            ) : (
              <Text size="sm" c="dimmed">
                No attendance entries match the current source filter.
              </Text>
            )}
          </Stack>
        </Paper>
      </SimpleGrid>
    </>
  );

  const visitorModal = (
    <Modal
      opened={opened}
      onClose={close}
      title="Quick add visitor"
      radius="lg"
      centered
    >
      <Stack gap="md">
        <TextInput
          label="Full name"
          value={visitorName}
          onChange={(event) => setVisitorName(event.currentTarget.value)}
          radius="md"
          required
        />
        <TextInput
          label="Email"
          value={visitorEmail}
          onChange={(event) => setVisitorEmail(event.currentTarget.value)}
          radius="md"
        />
        <TextInput
          label="Phone"
          value={visitorPhone}
          onChange={(event) => setVisitorPhone(event.currentTarget.value)}
          radius="md"
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={close}>
            Cancel
          </Button>
          <Button onClick={handleQuickAddVisitor} loading={isPending}>
            Add and check in
          </Button>
        </Group>
      </Stack>
    </Modal>
  );

  if (embedded) {
    return (
      <>
        <Stack gap="lg" p="md">
          <Group justify="flex-end">
            <Button variant="default" leftSection={<UserPlus size={15} />} onClick={open}>
              Quick add visitor
            </Button>
          </Group>
          {innerContent}
        </Stack>
        {visitorModal}
      </>
    );
  }

  return (
    <>
      <ApplicationShell
        session={session}
        workspaceHref={session.homePath}
        calendarHref="/app/calendar"
        sectionLabel="Events"
        title={data.event.title}
        description={session.appContext.church.name}
        sidebarTitle="Attendance & roster"
        sidebarDescription="Serving assignments, check-in, and follow-up prompts."
        navLabel="Church admin"
        navItems={[
          {
            href: session.homePath,
            label: "Home",
            description: "Operations",
            icon: HeartHandshake,
          },
          {
            href: "/app/church-admin/people",
            label: "People",
            description: "Records and statuses",
            icon: UsersRound,
          },
          {
            href: "/app/church-admin/accounts",
            label: "Accounts",
            description: "Portal approvals",
            icon: MailCheck,
          },
          {
            href: "/app/calendar",
            label: "Calendar",
            description: "All church events",
            icon: CalendarRange,
            active: true,
          },
          {
            href: "/app/communications",
            label: "Communications",
            description: "Broadcast and messaging",
            icon: BellRing,
          },
          {
            href: "/app/giving",
            label: "Giving",
            description: "Donations dashboard",
            icon: DollarSign,
          },
          {
            href: "/app/church-admin/ministry",
            label: "Ministry Forge",
            description: "Health, vision, and impact",
            icon: Sparkles,
          },
        ]}
        topActions={
          <Button
            variant="default"
            leftSection={<UserPlus size={15} />}
            onClick={open}
          >
            Quick add visitor
          </Button>
        }
      >
        {innerContent}
      </ApplicationShell>
      {visitorModal}
    </>
  );
}

// ── EventsListWorkspace ───────────────────────────────────────

const EVENTS_NAV = [
  { href: "/app/church-admin/events", label: "Events", description: "All events", icon: Calendar, active: true },
];

function formatEventDate(v: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  }).format(new Date(v));
}

export function EventsListWorkspace({
  session,
  events,
  source,
}: {
  session: import("@/lib/auth").ChurchAppSession;
  events: ChurchAdminEventsListEntry[];
  source: "preview" | "live";
}) {
  const searchParams = useSearchParams();
  const view = searchParams.get("view");
  const [showCreate, setShowCreate] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    title: "", description: "", category: "general",
    location: "", startsAt: "", endsAt: "",
  });
  const [err, setErr] = useState<string | null>(null);

  const eventRows =
    view === "needs-roster" ? events.filter((event) => event.rosterCount === 0) : events;
  const upcoming = eventRows.filter((e) => new Date(e.startsAt) >= new Date());
  const past = eventRows.filter((e) => new Date(e.startsAt) < new Date());
  const readinessState =
    view === "needs-roster"
      ? source === "preview"
        ? {
            state: "no-backend" as const,
            title: "Readiness target unavailable",
            description:
              "Event roster readiness can be previewed, but live event and roster checks need tenant data.",
            detail: "Configure the tenant backend before using this target to clear readiness.",
          }
        : eventRows.length === 0
          ? {
              state: "completed" as const,
              title: "Event roster readiness is clear",
              description: "No events currently need roster coverage.",
            }
          : {
              state: "validation-error" as const,
              title: "Events need roster coverage",
              description:
                "Open the matching events below to add roster assignments or confirm attendance setup.",
              detail: `${eventRows.length} event${eventRows.length === 1 ? "" : "s"} need roster review.`,
            }
      : source === "live" && events.length === 0
        ? {
            state: "empty" as const,
            title: "No event records yet",
            description:
              "Create upcoming events before using this workspace for roster, attendance, and readiness work.",
          }
        : null;

  function handleCreate() {
    if (!form.title.trim() || !form.startsAt || !form.endsAt) {
      setErr("Title, start date, and end date are required.");
      return;
    }
    setErr(null);
    startTransition(async () => {
      const res = await createEventAction({
        title: form.title,
        description: form.description || undefined,
        category: form.category,
        location: form.location || undefined,
        startsAt: form.startsAt,
        endsAt: form.endsAt,
      });
      if (res.ok) {
        setShowCreate(false);
        setForm({ title: "", description: "", category: "general", location: "", startsAt: "", endsAt: "" });
        if (res.id) window.location.href = `/app/church-admin/events/${res.id}`;
      } else {
        setErr(res.error ?? "Failed to create event.");
      }
    });
  }

  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/church-admin"
      calendarHref="/app/calendar"
      sectionLabel="Events"
      title="Events"
      description={session.appContext.church?.name ?? ""}
      sidebarTitle="Events"
      sidebarDescription="Event roster & attendance"
      navLabel="Events"
      navItems={EVENTS_NAV}
    >
      <Stack gap="md" p="md">
        <Group justify="space-between">
          <div>
            <Title order={2}>Events</Title>
            <Text c="dimmed" size="sm">
              {view === "needs-roster"
                ? `${eventRows.length} need roster review`
                : `${events.length} total`}
            </Text>
          </div>
          <Button leftSection={<Plus size={16} />} onClick={() => setShowCreate(true)}>
            New Event
          </Button>
        </Group>

        {view === "needs-roster" ? (
          <Paper withBorder radius="lg" p="md" bg="#f8fbff">
            <Group justify="space-between" gap="md">
              <div>
                <Text fw={700} size="sm">
                  Readiness view: events without roster coverage.
                </Text>
                <Text size="sm" c="dimmed" mt={4}>
                  Open an event to add roster assignments or confirm attendance setup.
                </Text>
              </div>
              <Text component={Link} href="/app/church-admin/readiness" size="sm" fw={700} c="churchBlue">
                Back to readiness
              </Text>
            </Group>
          </Paper>
        ) : null}

        {readinessState ? (
          <ReadinessTargetState
            {...readinessState}
            primaryAction={{ label: "Back to readiness", href: "/app/church-admin/readiness" }}
            secondaryAction={{ label: "All events", href: "/app/church-admin/events" }}
          />
        ) : null}

        <Tabs defaultValue="upcoming">
          <Tabs.List>
            <Tabs.Tab value="upcoming">Upcoming ({upcoming.length})</Tabs.Tab>
            <Tabs.Tab value="past">Past ({past.length})</Tabs.Tab>
          </Tabs.List>

          {(["upcoming", "past"] as const).map((tab) => (
            <Tabs.Panel key={tab} value={tab} pt="md">
              <Paper withBorder radius="md">
                <Table highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Title</Table.Th>
                      <Table.Th>Start</Table.Th>
                      <Table.Th>Location</Table.Th>
                      <Table.Th>Category</Table.Th>
                      <Table.Th>Roster</Table.Th>
                      <Table.Th />
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {(tab === "upcoming" ? upcoming : past).length === 0 ? (
                      <Table.Tr>
                        <Table.Td colSpan={6} ta="center" py="xl">
                          <Text c="dimmed" size="sm">No {tab} events.</Text>
                        </Table.Td>
                      </Table.Tr>
                    ) : (
                      (tab === "upcoming" ? upcoming : past).map((e) => (
                        <Table.Tr key={e.id}>
                          <Table.Td fw={500}>{e.title}</Table.Td>
                          <Table.Td><Text size="sm">{formatEventDate(e.startsAt)}</Text></Table.Td>
                          <Table.Td><Text size="sm" c="dimmed">{e.location ?? "—"}</Text></Table.Td>
                          <Table.Td>
                            <Badge variant="light" size="sm" tt="capitalize">{e.category}</Badge>
                          </Table.Td>
                          <Table.Td><Text size="sm">{e.rosterCount}</Text></Table.Td>
                          <Table.Td>
                            <Button
                              component={Link}
                              href={`/app/church-admin/events/${e.id}`}
                              variant="subtle"
                              size="xs"
                              rightSection={<ChevronRight size={14} />}
                            >
                              Open
                            </Button>
                          </Table.Td>
                        </Table.Tr>
                      ))
                    )}
                  </Table.Tbody>
                </Table>
              </Paper>
            </Tabs.Panel>
          ))}
        </Tabs>
      </Stack>

      <Modal opened={showCreate} onClose={() => setShowCreate(false)} title="Create Event" size="md">
        <Stack gap="sm">
          {err && <Alert color="red" icon={<AlertTriangle size={16} />}>{err}</Alert>}
          <TextInput label="Title" required value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          <TextInput label="Category" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} />
          <TextInput label="Location (optional)" value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} />
          <TextInput label="Start" type="datetime-local" required value={form.startsAt} onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))} />
          <TextInput label="End" type="datetime-local" required value={form.endsAt} onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))} />
          <Group justify="flex-end" mt="sm">
            <Button variant="default" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} loading={isPending}>Create</Button>
          </Group>
        </Stack>
      </Modal>
    </ApplicationShell>
  );
}

// ── EventRegistrationsPanel ───────────────────────────────────

import type {
  EventRegistration,
  EventRegistrationFormField,
  EventRegistrationSettings,
} from "@/lib/church-admin-events-data";
import {
  approveRegistrationAction,
  upsertRegistrationSettingsAction,
  upsertRegistrationFormFieldsAction,
  registerForEventAction,
  cancelRegistrationAction,
  checkInRegistrantAction,
  updateRegistrationPaymentFollowUpAction,
  initiateRegistrationRefundAction,
  type UpsertRegistrationSettingsInput,
} from "@/app/app/church-admin-actions";
import { NumberInput, Select, Switch, Textarea } from "@mantine/core";
import { Check, UserCheck, UserX, Download } from "lucide-react";

export function ChurchAdminEventDetailWorkspace({
  session,
  eventId,
  data,
  registrations,
  settings,
  formFields,
  initialTab = "roster",
}: {
  session: import("@/lib/auth").ChurchAppSession;
  eventId: string;
  data: ChurchAdminEventWorkspaceData;
  registrations: EventRegistration[];
  settings: EventRegistrationSettings | null;
  formFields: EventRegistrationFormField[];
  initialTab?: "roster" | "registrations";
}) {
  return (
    <ApplicationShell
      session={session}
      workspaceHref={session.homePath}
      calendarHref="/app/calendar"
      sectionLabel="Events"
      title={data.event.title}
      description={session.appContext.church.name}
      sidebarTitle="Event management"
      sidebarDescription="Roster, attendance & registrations"
      navLabel="Church admin"
      navItems={[
        {
          href: "/app/church-admin/events",
          label: "Events",
          description: "All events",
          icon: "ClipboardList",
          active: false,
        },
      ]}
    >
      <Tabs defaultValue={initialTab} p="md">
        <Tabs.List mb="md">
          <Tabs.Tab value="roster" leftSection={<Users size={14} />}>
            Roster & Attendance
          </Tabs.Tab>
          <Tabs.Tab value="registrations" leftSection={<ClipboardList size={14} />}>
            Registrations ({registrations.filter((r) => r.status !== "cancelled").length})
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="roster">
          <ChurchAdminEventWorkspace session={session} data={data} embedded />
        </Tabs.Panel>

        <Tabs.Panel value="registrations">
          <EventRegistrationsPanel
            session={session}
            eventId={eventId}
            registrations={registrations}
            settings={settings}
            formFields={formFields}
          />
        </Tabs.Panel>
      </Tabs>
    </ApplicationShell>
  );
}

export function EventRegistrationsPanel({
  session,
  eventId,
  registrations: initialRegistrations,
  settings: initialSettings,
  formFields: initialFormFields,
}: {
  session: import("@/lib/auth").ChurchAppSession;
  eventId: string;
  registrations: EventRegistration[];
  settings: EventRegistrationSettings | null;
  formFields: EventRegistrationFormField[];
}) {
  const [registrations, setRegistrations] = useState(initialRegistrations);
  type PaymentStatusFilter = "all" | "follow_up" | EventRegistration["paymentStatus"];
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<PaymentStatusFilter>("all");
  const [settings] = useState(initialSettings);
  const [formFields, setFormFields] = useState(initialFormFields);
  const [paymentFollowUpForms, setPaymentFollowUpForms] = useState<
    Record<string, { paymentStatus: EventRegistration["paymentStatus"]; note: string }>
  >({});
  const [refundForms, setRefundForms] = useState<
    Record<string, { amountCents: number; reason: string }>
  >({});
  const [refundConfirmOpen, setRefundConfirmOpen] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", notes: "" });
  const [settingsForm, setSettingsForm] = useState<Partial<UpsertRegistrationSettingsInput>>({
    registrationOpen: initialSettings?.registrationOpen ?? false,
    capacity: initialSettings?.capacity ?? undefined,
    waitlistEnabled: initialSettings?.waitlistEnabled ?? false,
    approvalRequired: initialSettings?.approvalRequired ?? false,
    householdRegistrationEnabled:
      initialSettings?.householdRegistrationEnabled ?? false,
    confirmationMessage: initialSettings?.confirmationMessage ?? "",
    mobileMemberCheckInEnabled:
      initialSettings?.mobileMemberCheckInEnabled ?? false,
    mobileMemberCheckInStartsAt:
      initialSettings?.mobileMemberCheckInStartsAt ?? undefined,
    mobileMemberCheckInEndsAt:
      initialSettings?.mobileMemberCheckInEndsAt ?? undefined,
    mobileMemberCheckInAccessCode:
      initialSettings?.mobileMemberCheckInAccessCode ?? "",
    mobileMemberCheckInAllowHousehold:
      initialSettings?.mobileMemberCheckInAllowHousehold ?? false,
    mobileMemberCheckInLocationLat:
      initialSettings?.mobileMemberCheckInLocationLat ?? undefined,
    mobileMemberCheckInLocationLng:
      initialSettings?.mobileMemberCheckInLocationLng ?? undefined,
    mobileMemberCheckInLocationRadiusMeters:
      initialSettings?.mobileMemberCheckInLocationRadiusMeters ?? undefined,
  });

  function handleSaveSettings() {
    startTransition(async () => {
      const res = await upsertRegistrationSettingsAction({
        eventId,
        registrationOpen: settingsForm.registrationOpen ?? false,
        capacity: settingsForm.capacity,
        waitlistEnabled: settingsForm.waitlistEnabled,
        approvalRequired: settingsForm.approvalRequired,
        householdRegistrationEnabled: settingsForm.householdRegistrationEnabled,
        confirmationMessage: settingsForm.confirmationMessage,
        mobileMemberCheckInEnabled:
          settingsForm.mobileMemberCheckInEnabled ?? false,
        mobileMemberCheckInStartsAt:
          settingsForm.mobileMemberCheckInStartsAt || undefined,
        mobileMemberCheckInEndsAt:
          settingsForm.mobileMemberCheckInEndsAt || undefined,
        mobileMemberCheckInAccessCode:
          settingsForm.mobileMemberCheckInAccessCode || undefined,
        mobileMemberCheckInAllowHousehold:
          settingsForm.mobileMemberCheckInAllowHousehold ?? false,
        mobileMemberCheckInLocationLat:
          settingsForm.mobileMemberCheckInLocationLat,
        mobileMemberCheckInLocationLng:
          settingsForm.mobileMemberCheckInLocationLng,
        mobileMemberCheckInLocationRadiusMeters:
          settingsForm.mobileMemberCheckInLocationRadiusMeters,
      });
      if (res.ok) setMsg({ type: "success", text: "Settings saved." });
      else setMsg({ type: "error", text: res.error ?? "Failed to save." });
    });
  }

  function handleSaveFormFields() {
    startTransition(async () => {
      const res = await upsertRegistrationFormFieldsAction({
        eventId,
        fields: formFields.map((field) => ({
          label: field.label,
          fieldKey: field.fieldKey,
          fieldType: field.fieldType,
          isRequired: field.isRequired,
          options: field.options,
        })),
      });

      if (res.ok) {
        setMsg({ type: "success", text: "Registration form fields saved." });
      } else {
        setMsg({ type: "error", text: res.error ?? "Failed to save registration form fields." });
      }
    });
  }

  function handleAddRegistrant() {
    if (!form.name.trim()) return;
    startTransition(async () => {
      const res = await registerForEventAction({
        eventId,
        churchId: session.appContext.church.id,
        registrantName: form.name,
        registrantEmail: form.email || undefined,
        registrantPhone: form.phone || undefined,
        notes: form.notes || undefined,
      });
      if (res.ok) {
        setShowAdd(false);
        setForm({ name: "", email: "", phone: "", notes: "" });
        setMsg({
          type: "success",
          text: res.isWaitlisted ? "Added to waitlist." : "Registered.",
        });
      } else {
        setMsg({ type: "error", text: res.error ?? "Failed to register." });
      }
    });
  }

  function handleCancel(id: string) {
    startTransition(async () => {
      const res = await cancelRegistrationAction(id, eventId);
      if (res.ok) {
        setRegistrations((r) => r.map((reg) => reg.id === id ? { ...reg, status: "cancelled" } : reg));
      } else {
        setMsg({ type: "error", text: res.error ?? "Failed to cancel." });
      }
    });
  }

  function handleApprove(id: string) {
    startTransition(async () => {
      const res = await approveRegistrationAction(id, eventId);
      if (res.ok) {
        setRegistrations((rows) =>
          rows.map((row) => (row.id === id ? { ...row, status: "confirmed" } : row)),
        );
      } else {
        setMsg({ type: "error", text: res.error ?? "Failed to approve registration." });
      }
    });
  }

  function handleCheckIn(id: string) {
    startTransition(async () => {
      const res = await checkInRegistrantAction(id, eventId);
      if (res.ok) {
        setRegistrations((r) => r.map((reg) => reg.id === id ? { ...reg, status: "attended", checkedInAt: new Date().toISOString() } : reg));
      } else {
        setMsg({ type: "error", text: res.error ?? "Failed to check in." });
      }
    });
  }

  function updatePaymentFollowUpForm(
    registration: EventRegistration,
    patch: Partial<{ paymentStatus: EventRegistration["paymentStatus"]; note: string }>,
  ) {
    setPaymentFollowUpForms((forms) => ({
      ...forms,
      [registration.id]: {
        paymentStatus:
          forms[registration.id]?.paymentStatus ??
          (registration.paymentStatus === "paid" || registration.paymentStatus === "failed"
            ? registration.paymentStatus
            : "paid"),
        note: forms[registration.id]?.note ?? registration.paymentFollowUpNote ?? "",
        ...patch,
      },
    }));
  }

  function getPaymentFollowUpForm(registration: EventRegistration) {
    return (
      paymentFollowUpForms[registration.id] ?? {
        paymentStatus:
          registration.paymentStatus === "paid" || registration.paymentStatus === "failed"
            ? registration.paymentStatus
            : "paid",
        note: registration.paymentFollowUpNote ?? "",
      }
    );
  }

  function handlePaymentFollowUp(registration: EventRegistration) {
    const form = getPaymentFollowUpForm(registration);

    startTransition(async () => {
      const res = await updateRegistrationPaymentFollowUpAction({
        registrationId: registration.id,
        eventId,
        paymentStatus: form.paymentStatus,
        note: form.note || undefined,
      });

      if (res.ok) {
        const followedUpAt = new Date().toISOString();
        setRegistrations((rows) =>
          rows.map((row) =>
            row.id === registration.id
              ? {
                  ...row,
                  paymentStatus: form.paymentStatus,
                  paymentFollowUpNote: form.note || null,
                  paymentFollowedUpAt: followedUpAt,
                  paymentFollowedUpBy: session.profile.name,
                }
              : row,
          ),
        );
        setMsg({ type: "success", text: "Payment follow-up updated." });
      } else {
        setMsg({ type: "error", text: res.error ?? "Failed to update payment follow-up." });
      }
    });
  }

  function exportCsv() {
    const rows = [
      ["Name", "Email", "Phone", "Status", "Payment Status", "Amount Paid", "Registered At"],
      ...registrations.map((r) => [
        r.registrantName, r.registrantEmail ?? "", r.registrantPhone ?? "",
        r.status,
        r.paymentStatus,
        (r.amountPaidCents / 100).toFixed(2),
        new Date(r.registeredAt).toLocaleDateString(),
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `registrations-${eventId.slice(-8)}.csv`;
    a.click();
  }

  const confirmed = registrations.filter((r) => !r.isWaitlisted && r.status !== "cancelled");
  const waitlisted = registrations.filter((r) => r.isWaitlisted);
  const paymentPending = registrations.filter((r) => r.paymentStatus === "pending");
  const paymentFollowUp = registrations.filter(
    (r) => r.status !== "cancelled" && !r.isWaitlisted && (r.paymentStatus === "pending" || r.paymentStatus === "failed"),
  );
  const paymentPaid = registrations.filter((r) => r.paymentStatus === "paid");
  const filteredRegistrations =
    paymentStatusFilter === "all"
      ? registrations
      : paymentStatusFilter === "follow_up"
        ? paymentFollowUp
      : registrations.filter((registration) => registration.paymentStatus === paymentStatusFilter);
  const hasCheckInWindow =
    Boolean(settingsForm.mobileMemberCheckInStartsAt) &&
    Boolean(settingsForm.mobileMemberCheckInEndsAt);
  const hasCheckInAccessCode =
    Boolean(settingsForm.mobileMemberCheckInAccessCode) &&
    String(settingsForm.mobileMemberCheckInAccessCode).trim().length > 0;
  const hasCheckInGeofence =
    settingsForm.mobileMemberCheckInLocationLat !== undefined &&
    settingsForm.mobileMemberCheckInLocationLng !== undefined &&
    settingsForm.mobileMemberCheckInLocationRadiusMeters !== undefined;

  const STATUS_COLOR: Record<string, string> = {
    pending_approval: "orange",
    confirmed: "blue", attended: "green", waitlisted: "yellow", cancelled: "gray",
  };
  const PAYMENT_STATUS_COLOR: Record<EventRegistration["paymentStatus"], string> = {
    not_required: "gray",
    pending: "yellow",
    paid: "teal",
    failed: "red",
    refunded: "violet",
    partially_refunded: "orange",
  };

  function formatPaymentStatus(value: EventRegistration["paymentStatus"]) {
    if (value === "not_required") return "not required";
    if (value === "partially_refunded") return "Partial Refund";
    if (value === "refunded") return "Refunded";
    return value;
  }

  return (
    <Stack gap="md">
      {msg && (
        <Alert
          color={msg.type === "success" ? "green" : "red"}
          onClose={() => setMsg(null)}
          withCloseButton
        >
          {msg.text}
        </Alert>
      )}

      {/* Settings panel */}
      <Paper withBorder p="md" radius="md">
        <Text fw={500} mb="sm">Registration Settings</Text>
        <Paper withBorder p="sm" radius="md" mb="sm">
          <Text size="sm" fw={500} mb="xs">
            Mobile check-in audit policy
          </Text>
          <Group gap="xs" mb="xs">
            <Badge
              color={settingsForm.mobileMemberCheckInEnabled ? "teal" : "gray"}
              variant="light"
            >
              {settingsForm.mobileMemberCheckInEnabled ? "enabled" : "disabled"}
            </Badge>
            <Badge color={hasCheckInWindow ? "teal" : "gray"} variant="light">
              {hasCheckInWindow ? "window enforced" : "default event window"}
            </Badge>
            <Badge color={hasCheckInAccessCode ? "teal" : "gray"} variant="light">
              {hasCheckInAccessCode ? "access code required" : "no access code"}
            </Badge>
            <Badge
              color={settingsForm.mobileMemberCheckInAllowHousehold ? "teal" : "gray"}
              variant="light"
            >
              {settingsForm.mobileMemberCheckInAllowHousehold
                ? "household mode on"
                : "self-only mode"}
            </Badge>
            <Badge color={hasCheckInGeofence ? "teal" : "gray"} variant="light">
              {hasCheckInGeofence ? "geofence required" : "no geofence"}
            </Badge>
          </Group>
          <Text size="xs" c="dimmed">
            Use the Roster & Attendance tab source filters to review mobile-member check-ins
            separately from staff, kiosk, and import attendance records.
          </Text>
        </Paper>
        <Stack gap="xs">
          <Switch
            label="Registration open"
            checked={settingsForm.registrationOpen ?? false}
            onChange={(e) => setSettingsForm((f) => ({ ...f, registrationOpen: e.target.checked }))}
          />
          <Group gap="sm" align="flex-end">
            <NumberInput
              label="Capacity (leave blank for unlimited)"
              value={settingsForm.capacity ?? ""}
              onChange={(v) => setSettingsForm((f) => ({ ...f, capacity: v === "" ? undefined : Number(v) }))}
              min={1}
              style={{ width: 200 }}
            />
            <Switch
              label="Enable waitlist when full"
              checked={settingsForm.waitlistEnabled ?? false}
              onChange={(e) => setSettingsForm((f) => ({ ...f, waitlistEnabled: e.target.checked }))}
            />
            <Switch
              label="Require approval before confirmation"
              checked={settingsForm.approvalRequired ?? false}
              onChange={(e) =>
                setSettingsForm((f) => ({ ...f, approvalRequired: e.target.checked }))
              }
            />
            <Switch
              label="Allow household registrations"
              checked={settingsForm.householdRegistrationEnabled ?? false}
              onChange={(e) =>
                setSettingsForm((f) => ({ ...f, householdRegistrationEnabled: e.target.checked }))
              }
            />
          </Group>
          <Switch
            label="Enable mobile member check-in"
            checked={settingsForm.mobileMemberCheckInEnabled ?? false}
            onChange={(e) =>
              setSettingsForm((f) => ({
                ...f,
                mobileMemberCheckInEnabled: e.target.checked,
              }))
            }
          />
          <Group grow>
            <TextInput
              label="Mobile check-in window start"
              type="datetime-local"
              value={settingsForm.mobileMemberCheckInStartsAt ?? ""}
              onChange={(e) =>
                setSettingsForm((f) => ({
                  ...f,
                  mobileMemberCheckInStartsAt: e.target.value,
                }))
              }
            />
            <TextInput
              label="Mobile check-in window end"
              type="datetime-local"
              value={settingsForm.mobileMemberCheckInEndsAt ?? ""}
              onChange={(e) =>
                setSettingsForm((f) => ({
                  ...f,
                  mobileMemberCheckInEndsAt: e.target.value,
                }))
              }
            />
          </Group>
          <TextInput
            label="Mobile check-in access code (optional)"
            value={settingsForm.mobileMemberCheckInAccessCode ?? ""}
            onChange={(e) =>
              setSettingsForm((f) => ({
                ...f,
                mobileMemberCheckInAccessCode: e.target.value,
              }))
            }
          />
          <Switch
            label="Allow household check-in with member session"
            checked={settingsForm.mobileMemberCheckInAllowHousehold ?? false}
            onChange={(e) =>
              setSettingsForm((f) => ({
                ...f,
                mobileMemberCheckInAllowHousehold: e.target.checked,
              }))
            }
          />
          <Group grow>
            <NumberInput
              label="Check-in location latitude (optional)"
              value={settingsForm.mobileMemberCheckInLocationLat ?? ""}
              onChange={(value) =>
                setSettingsForm((f) => ({
                  ...f,
                  mobileMemberCheckInLocationLat:
                    value === "" || value === null ? undefined : Number(value),
                }))
              }
              min={-90}
              max={90}
              decimalScale={6}
            />
            <NumberInput
              label="Check-in location longitude (optional)"
              value={settingsForm.mobileMemberCheckInLocationLng ?? ""}
              onChange={(value) =>
                setSettingsForm((f) => ({
                  ...f,
                  mobileMemberCheckInLocationLng:
                    value === "" || value === null ? undefined : Number(value),
                }))
              }
              min={-180}
              max={180}
              decimalScale={6}
            />
          </Group>
          <NumberInput
            label="Check-in location radius meters (optional)"
            value={settingsForm.mobileMemberCheckInLocationRadiusMeters ?? ""}
            onChange={(value) =>
              setSettingsForm((f) => ({
                ...f,
                mobileMemberCheckInLocationRadiusMeters:
                  value === "" || value === null ? undefined : Number(value),
              }))
            }
            min={1}
          />
          <Text size="xs" c="dimmed">
            Set latitude, longitude, and radius together to require on-site check-in.
          </Text>
          <Group justify="flex-end">
            <Button size="xs" onClick={handleSaveSettings} loading={isPending}>Save Settings</Button>
          </Group>
        </Stack>
      </Paper>

      <Paper withBorder p="md" radius="md">
        <Group justify="space-between" align="center" mb="sm">
          <Text fw={500}>Registration form fields</Text>
          <Button
            size="xs"
            variant="default"
            onClick={() =>
              setFormFields((rows) => [
                ...rows,
                {
                  id: `new-${rows.length + 1}`,
                  eventId,
                  label: "",
                  fieldKey: "",
                  fieldType: "text",
                  isRequired: false,
                  options: [],
                  sortOrder: rows.length,
                },
              ])
            }
          >
            Add field
          </Button>
        </Group>

        <Stack gap="xs">
          {formFields.length === 0 ? (
            <Text size="sm" c="dimmed">No custom registration fields configured.</Text>
          ) : (
            formFields.map((field, index) => (
              <Paper key={field.id} withBorder p="sm" radius="sm">
                <Group grow align="flex-end">
                  <TextInput
                    label="Label"
                    value={field.label}
                    onChange={(event) =>
                      setFormFields((rows) =>
                        rows.map((row, rowIndex) =>
                          rowIndex === index ? { ...row, label: event.currentTarget.value } : row,
                        ),
                      )
                    }
                  />
                  <TextInput
                    label="Field key"
                    value={field.fieldKey}
                    onChange={(event) =>
                      setFormFields((rows) =>
                        rows.map((row, rowIndex) =>
                          rowIndex === index ? { ...row, fieldKey: event.currentTarget.value } : row,
                        ),
                      )
                    }
                  />
                  <TextInput
                    label="Type"
                    value={field.fieldType}
                    onChange={(event) =>
                      setFormFields((rows) =>
                        rows.map((row, rowIndex) =>
                          rowIndex === index
                            ? {
                                ...row,
                                fieldType: event.currentTarget.value as EventRegistrationFormField["fieldType"],
                              }
                            : row,
                        ),
                      )
                    }
                  />
                </Group>
                <Group justify="space-between" mt="sm">
                  <Switch
                    label="Required"
                    checked={field.isRequired}
                    onChange={(event) =>
                      setFormFields((rows) =>
                        rows.map((row, rowIndex) =>
                          rowIndex === index ? { ...row, isRequired: event.target.checked } : row,
                        ),
                      )
                    }
                  />
                  <Button
                    size="xs"
                    color="red"
                    variant="subtle"
                    onClick={() =>
                      setFormFields((rows) => rows.filter((_, rowIndex) => rowIndex !== index))
                    }
                  >
                    Remove
                  </Button>
                </Group>
              </Paper>
            ))
          )}
          <Group justify="flex-end">
            <Button size="xs" onClick={handleSaveFormFields} loading={isPending}>
              Save form fields
            </Button>
          </Group>
        </Stack>
      </Paper>

      {/* Stats */}
      <Group gap="md">
        <Paper withBorder p="sm" radius="md" style={{ flex: 1 }}>
          <Text size="xs" c="dimmed">Confirmed</Text>
          <Text fw={700} size="xl">{confirmed.length}</Text>
          {settings?.capacity && (
            <Text size="xs" c="dimmed">of {settings.capacity} capacity</Text>
          )}
        </Paper>
        <Paper withBorder p="sm" radius="md" style={{ flex: 1 }}>
          <Text size="xs" c="dimmed">Waitlisted</Text>
          <Text fw={700} size="xl">{waitlisted.length}</Text>
        </Paper>
        <Paper withBorder p="sm" radius="md" style={{ flex: 1 }}>
          <Text size="xs" c="dimmed">Attended</Text>
          <Text fw={700} size="xl">{registrations.filter((r) => r.status === "attended").length}</Text>
        </Paper>
        <Paper withBorder p="sm" radius="md" style={{ flex: 1 }}>
          <Text size="xs" c="dimmed">Payment pending</Text>
          <Text fw={700} size="xl">{paymentPending.length}</Text>
        </Paper>
        <Paper withBorder p="sm" radius="md" style={{ flex: 1 }}>
          <Text size="xs" c="dimmed">Payment follow-up</Text>
          <Text fw={700} size="xl">{paymentFollowUp.length}</Text>
        </Paper>
        <Paper withBorder p="sm" radius="md" style={{ flex: 1 }}>
          <Text size="xs" c="dimmed">Paid</Text>
          <Text fw={700} size="xl">{paymentPaid.length}</Text>
        </Paper>
      </Group>

      {/* Actions */}
      <Group justify="space-between">
        <Text fw={500}>Registrants</Text>
        <Group gap="xs">
          <Button size="xs" variant="default" leftSection={<Download size={13} />} onClick={exportCsv}>
            Export CSV
          </Button>
          <Button size="xs" leftSection={<Plus size={13} />} onClick={() => setShowAdd(true)}>
            Add Registrant
          </Button>
        </Group>
      </Group>

      <Group gap="xs">
        <Button
          size="xs"
          variant={paymentStatusFilter === "all" ? "filled" : "light"}
          onClick={() => setPaymentStatusFilter("all")}
        >
          All ({registrations.length})
        </Button>
        <Button
          size="xs"
          variant={paymentStatusFilter === "follow_up" ? "filled" : "light"}
          color="orange"
          onClick={() => setPaymentStatusFilter("follow_up")}
        >
          Follow-up ({paymentFollowUp.length})
        </Button>
        {([
          "pending",
          "paid",
          "failed",
          "refunded",
          "partially_refunded",
          "not_required",
        ] as const).map((status) => {
          const count = registrations.filter((registration) => registration.paymentStatus === status).length;
          return (
            <Button
              key={status}
              size="xs"
              variant={paymentStatusFilter === status ? "filled" : "light"}
              onClick={() => setPaymentStatusFilter(status)}
            >
              {formatPaymentStatus(status)} ({count})
            </Button>
          );
        })}
      </Group>

      {showAdd && (
        <Paper withBorder p="md" radius="md">
          <Stack gap="xs">
            <Text fw={500} size="sm">Add registrant manually</Text>
            <TextInput label="Name" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            <Group gap="sm">
              <TextInput label="Email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} style={{ flex: 1 }} />
              <TextInput label="Phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} style={{ flex: 1 }} />
            </Group>
            <TextInput label="Notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            <Group justify="flex-end">
              <Button variant="default" size="xs" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button size="xs" onClick={handleAddRegistrant} loading={isPending}>Add</Button>
            </Group>
          </Stack>
        </Paper>
      )}

      <Paper withBorder radius="md">
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Contact</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Payment</Table.Th>
              <Table.Th>Registered</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {filteredRegistrations.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={6} ta="center" py="xl">
                  <Text c="dimmed" size="sm">No registrations match this payment filter.</Text>
                </Table.Td>
              </Table.Tr>
            ) : (
              filteredRegistrations.map((r) => (
                <Table.Tr key={r.id} style={{ opacity: r.status === "cancelled" ? 0.5 : 1 }}>
                  <Table.Td fw={500}>{r.registrantName}</Table.Td>
                  <Table.Td>
                    <Text size="sm">{r.registrantEmail ?? r.registrantPhone ?? "—"}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge size="sm" color={STATUS_COLOR[r.status] ?? "gray"} variant="light">
                      {r.status}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Stack gap={2}>
                      <Badge
                        size="sm"
                        color={PAYMENT_STATUS_COLOR[r.paymentStatus]}
                        variant="light"
                      >
                        {formatPaymentStatus(r.paymentStatus)}
                      </Badge>
                      {r.amountPaidCents > 0 ? (
                        <Text size="xs" c="dimmed">
                          ${(r.amountPaidCents / 100).toFixed(2)} paid
                        </Text>
                      ) : null}
                      {r.stripePaymentIntentId ? (
                        <Text size="xs" c="dimmed">
                          PI {r.stripePaymentIntentId.slice(0, 12)}...
                        </Text>
                      ) : null}
                      {r.paymentFollowedUpAt ? (
                        <Text size="xs" c="dimmed">
                          Followed up {new Date(r.paymentFollowedUpAt).toLocaleDateString()}
                          {r.paymentFollowedUpBy ? ` by ${r.paymentFollowedUpBy}` : ""}
                        </Text>
                      ) : null}
                      {r.paymentFollowUpNote ? (
                        <Text size="xs" c="dimmed">
                          Note: {r.paymentFollowUpNote}
                        </Text>
                      ) : null}
                      {(r.paymentStatus === "pending" || r.paymentStatus === "failed") && (
                        <Paper withBorder p="xs" radius="sm" mt={4}>
                          <Stack gap={6}>
                            <Text size="xs" fw={600}>Resolve payment follow-up</Text>
                            <Select
                              size="xs"
                              label="Follow-up status"
                              value={getPaymentFollowUpForm(r).paymentStatus}
                              data={[
                                { value: "paid", label: "Paid" },
                                { value: "failed", label: "Failed" },
                                { value: "refunded", label: "Refunded" },
                              ]}
                              onChange={(value) =>
                                updatePaymentFollowUpForm(r, {
                                  paymentStatus:
                                    (value as EventRegistration["paymentStatus"] | null) ?? "paid",
                                })
                              }
                            />
                            <Textarea
                              size="xs"
                              label="Follow-up note"
                              minRows={2}
                              value={getPaymentFollowUpForm(r).note}
                              onChange={(event) =>
                                updatePaymentFollowUpForm(r, { note: event.currentTarget.value })
                              }
                            />
                            <Button
                              size="xs"
                              variant="light"
                              color="orange"
                              onClick={() => handlePaymentFollowUp(r)}
                              loading={isPending}
                            >
                              Save payment follow-up
                            </Button>
                          </Stack>
                        </Paper>
                      )}
                      {r.paymentStatus === "paid" && (
                        <Paper withBorder p="xs" radius="sm" mt="xs">
                          <Text size="xs" fw={600} mb="xs">Initiate Refund</Text>
                          <NumberInput
                            label="Refund amount ($)"
                            min={0.01}
                            max={r.amountPaidCents / 100}
                            step={0.01}
                            decimalScale={2}
                            value={(refundForms[r.id]?.amountCents ?? r.amountPaidCents) / 100}
                            onChange={(value) =>
                              setRefundForms((forms) => ({
                                ...forms,
                                [r.id]: {
                                  ...forms[r.id],
                                  amountCents: Math.round(Number(value) * 100),
                                  reason: forms[r.id]?.reason ?? "",
                                },
                              }))
                            }
                          />
                          <Select
                            label="Reason (optional)"
                            clearable
                            data={[
                              { value: "requested_by_customer", label: "Requested by customer" },
                              { value: "duplicate", label: "Duplicate" },
                              { value: "fraudulent", label: "Fraudulent" },
                            ]}
                            value={refundForms[r.id]?.reason || null}
                            onChange={(value) =>
                              setRefundForms((forms) => ({
                                ...forms,
                                [r.id]: {
                                  ...forms[r.id],
                                  amountCents: forms[r.id]?.amountCents ?? r.amountPaidCents,
                                  reason: value ?? "",
                                },
                              }))
                            }
                            mt="xs"
                          />
                          <Button
                            color="red"
                            variant="light"
                            size="xs"
                            mt="xs"
                            aria-label={`Initiate refund for ${r.registrantName}`}
                            onClick={() => setRefundConfirmOpen(r.id)}
                          >
                            Initiate refund
                          </Button>
                        </Paper>
                      )}
                    </Stack>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs" c="dimmed">{new Date(r.registeredAt).toLocaleDateString()}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4} justify="flex-end">
                      {r.status === "pending_approval" && (
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          color="blue"
                          title="Approve"
                          onClick={() => handleApprove(r.id)}
                          disabled={isPending}
                        >
                          <Check size={13} />
                        </ActionIcon>
                      )}
                      {r.status === "confirmed" && (
                        <ActionIcon size="sm" variant="subtle" color="green" title="Check in" onClick={() => handleCheckIn(r.id)} disabled={isPending}>
                          <UserCheck size={13} />
                        </ActionIcon>
                      )}
                      {(r.status === "pending_approval" || r.status === "confirmed" || r.status === "waitlisted") && (
                        <ActionIcon size="sm" variant="subtle" color="red" title="Cancel" onClick={() => handleCancel(r.id)} disabled={isPending}>
                          <UserX size={13} />
                        </ActionIcon>
                      )}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))
            )}
          </Table.Tbody>
        </Table>
      </Paper>

      <Modal
        opened={refundConfirmOpen !== null}
        onClose={() => setRefundConfirmOpen(null)}
        title="Confirm refund"
      >
        <Stack gap="md">
          <Text size="sm">
            This will issue a refund of $
            {refundConfirmOpen !== null
              ? (
                  (refundForms[refundConfirmOpen]?.amountCents ??
                    (registrations.find((r) => r.id === refundConfirmOpen)?.amountPaidCents ?? 0)) /
                  100
                ).toFixed(2)
              : "0.00"}{" "}
            to the registrant. This action cannot be undone.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setRefundConfirmOpen(null)}>
              Cancel
            </Button>
            <Button
              color="red"
              loading={isPending}
              onClick={() => {
                if (refundConfirmOpen === null) return;
                const registrationId = refundConfirmOpen;
                const reg = registrations.find((r) => r.id === registrationId);
                const amountCents =
                  refundForms[registrationId]?.amountCents ?? reg?.amountPaidCents ?? 0;
                startTransition(async () => {
                  const res = await initiateRegistrationRefundAction({
                    registrationId,
                    eventId,
                    amountCents,
                    reason: (refundForms[registrationId]?.reason || undefined) as
                      | "duplicate"
                      | "fraudulent"
                      | "requested_by_customer"
                      | undefined,
                  });
                  if (res.ok) {
                    setRefundConfirmOpen(null);
                    setRefundForms((forms) => {
                      const next = { ...forms };
                      delete next[registrationId];
                      return next;
                    });
                    setRegistrations((rows) =>
                      rows.map((row) =>
                        row.id === registrationId
                          ? {
                              ...row,
                              paymentStatus:
                                amountCents >= (reg?.amountPaidCents ?? 0)
                                  ? ("refunded" as const)
                                  : ("partially_refunded" as const),
                            }
                          : row,
                      ),
                    );
                    notifications.show({
                      title: "Refund initiated",
                      message: "Refund initiated successfully.",
                      color: "teal",
                    });
                  } else {
                    notifications.show({
                      title: "Refund failed",
                      message: res.error ?? "The refund could not be completed.",
                      color: "red",
                    });
                  }
                });
              }}
            >
              Confirm refund
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
