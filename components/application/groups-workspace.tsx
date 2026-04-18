"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  ActionIcon,
  Badge,
  Button,
  Divider,
  Group,
  Modal,
  NumberInput,
  Paper,
  Select,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Textarea,
  Title,
  Switch,
  Alert,
} from "@mantine/core";
import {
  Users,
  Plus,
  ChevronRight,
  Calendar,
  MapPin,
  UserCheck,
  BookOpen,
  AlertCircle,
  Check,
  Trash2,
} from "lucide-react";

import { ApplicationShell } from "@/components/application/app-shell";
import type { ChurchAppSession } from "@/lib/auth";
import type {
  GroupsListData,
  GroupDetail,
  GroupMember,
  GroupMeeting,
} from "@/lib/groups-types";
import { GROUP_CATEGORIES, MEETING_DAYS } from "@/lib/groups-types";
import {
  createGroupAction,
  addGroupMemberAction,
  removeGroupMemberAction,
  logGroupMeetingAction,
  updateGroupAction,
  type CreateGroupInput,
} from "@/app/app/groups-actions";

// ── Shared nav helpers ────────────────────────────────────────

function groupsNavItems(activeHref: string) {
  return [
    {
      href: "/app/church-admin/groups",
      label: "All Groups",
      description: "Group directory",
      icon: Users,
      active: activeHref === "/app/church-admin/groups",
    },
    {
      href: "/app/church-admin/attendance",
      label: "Attendance",
      description: "Service headcounts",
      icon: Calendar,
      active: activeHref === "/app/church-admin/attendance",
    },
  ];
}

// ── GroupsWorkspace (list) ────────────────────────────────────

export function GroupsWorkspace({
  session,
  data,
}: {
  session: ChurchAppSession;
  data: GroupsListData;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<CreateGroupInput>>({
    category: "general",
    isOpen: true,
  });

  function handleCreate() {
    if (!form.name?.trim()) { setError("Group name is required."); return; }
    setError(null);
    startTransition(async () => {
      const res = await createGroupAction({
        name: form.name!,
        description: form.description,
        category: form.category ?? "general",
        leaderProfileId: form.leaderProfileId,
        meetingDay: form.meetingDay,
        meetingTime: form.meetingTime,
        meetingLocation: form.meetingLocation,
        capacity: form.capacity,
        isOpen: form.isOpen ?? true,
      });
      if (res.ok) {
        setShowCreate(false);
        setForm({ category: "general", isOpen: true });
        if (res.id) window.location.href = `/app/church-admin/groups/${res.id}`;
      } else {
        setError(res.error ?? "Failed to create group.");
      }
    });
  }

  const { groups } = data;

  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/church-admin"
      calendarHref="/app/calendar"
      sectionLabel="Small Groups"
      title="Small Groups"
      description={session.appContext.church?.name ?? ""}
      sidebarTitle="Small Groups"
      sidebarDescription="Group directory & attendance"
      navLabel="Groups"
      navItems={groupsNavItems("/app/church-admin/groups")}
    >
      <Stack gap="md" p="md">
        <Group justify="space-between">
          <div>
            <Title order={2}>Small Groups</Title>
            <Text c="dimmed" size="sm">{groups.length} group{groups.length !== 1 ? "s" : ""}</Text>
          </div>
          <Button leftSection={<Plus size={16} />} onClick={() => setShowCreate(true)}>
            New Group
          </Button>
        </Group>

        {groups.length === 0 ? (
          <Paper p="xl" withBorder ta="center">
            <Users size={40} color="var(--mantine-color-dimmed)" />
            <Text mt="sm" c="dimmed">No groups yet. Create the first one.</Text>
          </Paper>
        ) : (
          <Paper withBorder radius="md">
            <Table highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>Category</Table.Th>
                  <Table.Th>Leader</Table.Th>
                  <Table.Th>Members</Table.Th>
                  <Table.Th>Day</Table.Th>
                  <Table.Th>Open</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {groups.map((g) => (
                  <Table.Tr key={g.id}>
                    <Table.Td fw={500}>{g.name}</Table.Td>
                    <Table.Td>
                      <Badge variant="light" size="sm" tt="capitalize">
                        {g.category.replace("_", " ")}
                      </Badge>
                    </Table.Td>
                    <Table.Td>{g.leaderName ?? <Text c="dimmed" size="sm">—</Text>}</Table.Td>
                    <Table.Td>
                      <Group gap={4}>
                        <Users size={14} />
                        <Text size="sm">{g.memberCount}</Text>
                        {g.capacity && (
                          <Text size="xs" c="dimmed">/ {g.capacity}</Text>
                        )}
                      </Group>
                    </Table.Td>
                    <Table.Td>{g.meetingDay ?? "—"}</Table.Td>
                    <Table.Td>
                      <Badge color={g.isOpen ? "green" : "gray"} variant="dot" size="sm">
                        {g.isOpen ? "Open" : "Closed"}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <ActionIcon
                        component={Link}
                        href={`/app/church-admin/groups/${g.id}`}
                        variant="subtle"
                      >
                        <ChevronRight size={16} />
                      </ActionIcon>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Paper>
        )}
      </Stack>

      <Modal opened={showCreate} onClose={() => setShowCreate(false)} title="Create Group" size="md">
        <Stack gap="sm">
          {error && <Alert color="red" icon={<AlertCircle size={16} />}>{error}</Alert>}
          <TextInput
            label="Group Name" required
            value={form.name ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <Textarea
            label="Description"
            value={form.description ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={2}
          />
          <Select
            label="Category" required
            data={GROUP_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))}
            value={form.category ?? "general"}
            onChange={(v) => setForm((f) => ({ ...f, category: v as CreateGroupInput["category"] }))}
          />
          <Select
            label="Meeting Day"
            data={MEETING_DAYS}
            value={form.meetingDay ?? null}
            onChange={(v) => setForm((f) => ({ ...f, meetingDay: v ?? undefined }))}
            clearable
          />
          <TextInput
            label="Meeting Time (e.g. 7:00 PM)"
            value={form.meetingTime ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, meetingTime: e.target.value }))}
          />
          <TextInput
            label="Location"
            value={form.meetingLocation ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, meetingLocation: e.target.value }))}
          />
          <NumberInput
            label="Capacity (optional)"
            value={form.capacity ?? ""}
            onChange={(v) => setForm((f) => ({ ...f, capacity: typeof v === "number" ? v : undefined }))}
            min={1}
          />
          <Switch
            label="Open for new members"
            checked={form.isOpen ?? true}
            onChange={(e) => setForm((f) => ({ ...f, isOpen: e.target.checked }))}
          />
          <Group justify="flex-end" mt="sm">
            <Button variant="default" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} loading={isPending}>Create Group</Button>
          </Group>
        </Stack>
      </Modal>
    </ApplicationShell>
  );
}

// ── GroupDetailWorkspace ──────────────────────────────────────

export function GroupDetailWorkspace({
  session,
  detail,
}: {
  session: ChurchAppSession;
  detail: GroupDetail;
}) {
  const { group, members, upcomingMeetings, pastMeetings, resources } = detail;
  const [addMemberProfileId, setAddMemberProfileId] = useState("");
  const [meetingDate, setMeetingDate] = useState("");
  const [meetingLocation, setMeetingLocation] = useState("");
  const [meetingNotes, setMeetingNotes] = useState("");
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  function handleAddMember() {
    if (!addMemberProfileId.trim()) return;
    startTransition(async () => {
      const res = await addGroupMemberAction(group.id, addMemberProfileId.trim());
      if (res.ok) {
        setAddMemberProfileId("");
        setMsg({ type: "success", text: "Member added." });
      } else {
        setMsg({ type: "error", text: res.error ?? "Failed to add member." });
      }
    });
  }

  function handleRemoveMember(memberId: string) {
    startTransition(async () => {
      const res = await removeGroupMemberAction(group.id, memberId);
      if (!res.ok) setMsg({ type: "error", text: res.error ?? "Failed to remove member." });
    });
  }

  function handleLogMeeting() {
    if (!meetingDate) return;
    startTransition(async () => {
      const res = await logGroupMeetingAction({
        groupId: group.id,
        scheduledAt: meetingDate,
        location: meetingLocation || undefined,
        notes: meetingNotes || undefined,
      });
      if (res.ok) {
        setMeetingDate("");
        setMeetingLocation("");
        setMeetingNotes("");
        setMsg({ type: "success", text: "Meeting logged." });
      } else {
        setMsg({ type: "error", text: res.error ?? "Failed to log meeting." });
      }
    });
  }

  function handleToggleActive() {
    startTransition(async () => {
      await updateGroupAction(group.id, { isActive: !group.isActive });
    });
  }

  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/church-admin"
      calendarHref="/app/calendar"
      sectionLabel="Small Groups"
      title={group.name}
      description={session.appContext.church?.name ?? ""}
      sidebarTitle="Small Groups"
      sidebarDescription="Group directory & attendance"
      navLabel="Groups"
      navItems={groupsNavItems("/app/church-admin/groups")}
    >
      <Stack gap="md" p="md">
        <Group justify="space-between" wrap="nowrap">
          <div>
            <Group gap="xs">
              <Title order={2}>{group.name}</Title>
              <Badge color={group.isActive ? "green" : "gray"} variant="light">
                {group.isActive ? "Active" : "Inactive"}
              </Badge>
              <Badge variant="dot" color={group.isOpen ? "blue" : "gray"}>
                {group.isOpen ? "Open" : "Closed"}
              </Badge>
            </Group>
            <Text c="dimmed" size="sm">{group.description}</Text>
            <Group gap="md" mt={4}>
              {group.meetingDay && (
                <Group gap={4}><Calendar size={13} /><Text size="xs">{group.meetingDay} {group.meetingTime}</Text></Group>
              )}
              {group.meetingLocation && (
                <Group gap={4}><MapPin size={13} /><Text size="xs">{group.meetingLocation}</Text></Group>
              )}
              {group.leaderName && (
                <Group gap={4}><UserCheck size={13} /><Text size="xs">Led by {group.leaderName}</Text></Group>
              )}
            </Group>
          </div>
          <Group gap="xs">
            <Button
              variant="subtle"
              color={group.isActive ? "red" : "green"}
              size="xs"
              onClick={handleToggleActive}
              loading={isPending}
            >
              {group.isActive ? "Deactivate" : "Activate"}
            </Button>
          </Group>
        </Group>

        {msg && (
          <Alert
            color={msg.type === "success" ? "green" : "red"}
            icon={msg.type === "success" ? <Check size={16} /> : <AlertCircle size={16} />}
            onClose={() => setMsg(null)}
            withCloseButton
          >
            {msg.text}
          </Alert>
        )}

        <Tabs defaultValue="members">
          <Tabs.List>
            <Tabs.Tab value="members" leftSection={<Users size={14} />}>
              Members ({members.filter((m) => m.status === "active").length})
            </Tabs.Tab>
            <Tabs.Tab value="meetings" leftSection={<Calendar size={14} />}>
              Meetings
            </Tabs.Tab>
            <Tabs.Tab value="resources" leftSection={<BookOpen size={14} />}>
              Resources
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="members" pt="md">
            <Stack gap="sm">
              <MembersTable members={members} onRemove={handleRemoveMember} isPending={isPending} />
              <Divider label="Add member by profile ID" labelPosition="center" />
              <Group gap="sm">
                <TextInput
                  placeholder="Profile UUID"
                  value={addMemberProfileId}
                  onChange={(e) => setAddMemberProfileId(e.target.value)}
                  style={{ flex: 1 }}
                />
                <Button onClick={handleAddMember} loading={isPending} leftSection={<Plus size={14} />}>
                  Add
                </Button>
              </Group>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="meetings" pt="md">
            <Stack gap="sm">
              {upcomingMeetings.length > 0 && (
                <>
                  <Text fw={500} size="sm">Upcoming</Text>
                  <MeetingsTable meetings={upcomingMeetings} />
                </>
              )}
              {pastMeetings.length > 0 && (
                <>
                  <Text fw={500} size="sm" mt="sm">Past meetings</Text>
                  <MeetingsTable meetings={pastMeetings} />
                </>
              )}
              {upcomingMeetings.length === 0 && pastMeetings.length === 0 && (
                <Text c="dimmed" size="sm" ta="center" py="md">No meetings logged yet.</Text>
              )}
              <Divider label="Log a meeting" labelPosition="center" mt="sm" />
              <Stack gap="xs">
                <TextInput
                  label="Date & Time"
                  type="datetime-local"
                  value={meetingDate}
                  onChange={(e) => setMeetingDate(e.target.value)}
                />
                <TextInput
                  label="Location (optional)"
                  value={meetingLocation}
                  onChange={(e) => setMeetingLocation(e.target.value)}
                />
                <Textarea
                  label="Notes (optional)"
                  value={meetingNotes}
                  onChange={(e) => setMeetingNotes(e.target.value)}
                  rows={2}
                />
                <Group justify="flex-end">
                  <Button onClick={handleLogMeeting} loading={isPending} leftSection={<Plus size={14} />}>
                    Log Meeting
                  </Button>
                </Group>
              </Stack>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="resources" pt="md">
            {resources.length === 0 ? (
              <Text c="dimmed" size="sm" ta="center" py="md">No resources added yet.</Text>
            ) : (
              <Stack gap="xs">
                {resources.map((r) => (
                  <Paper key={r.id} p="sm" withBorder radius="sm">
                    <Group justify="space-between">
                      <div>
                        <Text size="sm" fw={500}>{r.title}</Text>
                        {r.url && <Text size="xs" c="blue" component="a" href={r.url} target="_blank">{r.url}</Text>}
                      </div>
                      <Badge size="xs" variant="light">{r.resourceType}</Badge>
                    </Group>
                  </Paper>
                ))}
              </Stack>
            )}
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </ApplicationShell>
  );
}

// ── Sub-components ────────────────────────────────────────────

function MembersTable({
  members,
  onRemove,
  isPending,
}: {
  members: GroupMember[];
  onRemove: (id: string) => void;
  isPending: boolean;
}) {
  if (members.length === 0) {
    return <Text c="dimmed" size="sm" ta="center" py="md">No members yet.</Text>;
  }
  return (
    <Paper withBorder radius="md">
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Name</Table.Th>
            <Table.Th>Role</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th>Joined</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {members.map((m) => (
            <Table.Tr key={m.id}>
              <Table.Td>{m.fullName}</Table.Td>
              <Table.Td>
                <Badge
                  size="sm"
                  color={m.role === "leader" ? "blue" : m.role === "co_leader" ? "grape" : "gray"}
                  variant="light"
                  tt="capitalize"
                >
                  {m.role.replace("_", " ")}
                </Badge>
              </Table.Td>
              <Table.Td>
                <Badge
                  size="sm"
                  color={m.status === "active" ? "green" : m.status === "pending" ? "yellow" : "gray"}
                  variant="dot"
                >
                  {m.status}
                </Badge>
              </Table.Td>
              <Table.Td>
                <Text size="xs" c="dimmed">
                  {new Date(m.joinedAt).toLocaleDateString()}
                </Text>
              </Table.Td>
              <Table.Td>
                <ActionIcon
                  color="red"
                  variant="subtle"
                  size="sm"
                  disabled={isPending}
                  onClick={() => onRemove(m.id)}
                >
                  <Trash2 size={14} />
                </ActionIcon>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Paper>
  );
}

function MeetingsTable({ meetings }: { meetings: GroupMeeting[] }) {
  return (
    <Paper withBorder radius="md">
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Date</Table.Th>
            <Table.Th>Location</Table.Th>
            <Table.Th>Attendance</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {meetings.map((m) => (
            <Table.Tr key={m.id}>
              <Table.Td>
                {new Date(m.scheduledAt).toLocaleDateString("en-US", {
                  weekday: "short", month: "short", day: "numeric",
                })}
              </Table.Td>
              <Table.Td>{m.location ?? "—"}</Table.Td>
              <Table.Td>
                <Group gap={4}>
                  <UserCheck size={13} />
                  <Text size="sm">{m.attendanceCount}</Text>
                </Group>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Paper>
  );
}
