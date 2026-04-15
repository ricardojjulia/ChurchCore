"use client";

import { useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  BellRing,
  CalendarRange,
  DollarSign,
  HeartHandshake,
  MailCheck,
  Search,
  Sparkles,
  UserPlus,
  UsersRound,
} from "lucide-react";
import {
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
import type { ChurchAppSession } from "@/lib/auth";
import type { ChurchAdminEventWorkspaceData } from "@/lib/church-admin-events-data";

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
}: {
  session: ChurchAppSession;
  data: ChurchAdminEventWorkspaceData;
}) {
  const [rosterQuery, setRosterQuery] = useState("");
  const [attendanceQuery, setAttendanceQuery] = useState("");
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
            href: "/app/church-admin/ministry/overview",
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

          <Paper withBorder radius="xl" p="xl">
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
            <Stack gap="sm">
              {data.attendanceEntries.length ? (
                data.attendanceEntries.map((entry) => (
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
                          {formatDateTime(entry.checkedInAt)} • {entry.checkInMethod.replaceAll("_", " ")}
                        </Text>
                      </Stack>
                      <Badge color="teal" variant="light">
                        {entry.status}
                      </Badge>
                    </Group>
                  </Paper>
                ))
              ) : (
                <Text size="sm" c="dimmed">
                  No one has been checked in yet.
                </Text>
              )}
            </Stack>
          </Paper>
        </SimpleGrid>
      </ApplicationShell>

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
    </>
  );
}
