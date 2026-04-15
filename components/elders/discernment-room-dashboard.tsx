"use client";

import { useTransition, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Divider,
  Drawer,
  Group,
  Paper,
  Select,
  Stack,
  Tabs,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { BookOpen, Lock, PlusCircle, ScrollText } from "lucide-react";

import {
  addElderNoteAction,
  createDiscernmentSessionAction,
} from "@/app/app/elders-actions";
import { DiscernmentSessionCard } from "@/components/elders/discernment-session-card";
import { ApplicationShell } from "@/components/application/app-shell";
import type { ChurchAppSession } from "@/lib/auth";
import type { DiscernmentRoomData, ElderNote } from "@/lib/elders-types";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function ElderNoteCard({ note }: { note: ElderNote }) {
  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap={6}>
        <Group justify="space-between" align="center">
          <Group gap="xs">
            {note.isConfidential ? (
              <Lock size={12} color="var(--mantine-color-orange-5)" />
            ) : null}
            {note.subjectName ? (
              <Text fz="xs" fw={600} c="dimmed">
                Re: {note.subjectName}
              </Text>
            ) : (
              <Text fz="xs" c="dimmed">
                General note
              </Text>
            )}
          </Group>
          <Text fz="xs" c="dimmed">
            {note.createdByName ?? "Elder"} · {formatDate(note.createdAt)}
          </Text>
        </Group>
        <Text fz="sm" style={{ whiteSpace: "pre-wrap" }}>
          {note.content}
        </Text>
        {note.isConfidential ? (
          <Badge size="xs" color="orange" variant="light" radius="sm">
            Confidential
          </Badge>
        ) : null}
      </Stack>
    </Paper>
  );
}

export function DiscernmentRoomDashboard({
  session,
  data,
}: {
  session: ChurchAppSession;
  data: DiscernmentRoomData;
}) {
  const { sessions, recentNotes } = data;

  // New session drawer
  const [sessionDrawerOpen, sessionDrawer] = useDisclosure(false);
  const [sessionTitle, setSessionTitle] = useState("");
  const [sessionDescription, setSessionDescription] = useState("");
  const [sessionDate, setSessionDate] = useState("");

  // New note drawer
  const [noteDrawerOpen, noteDrawer] = useDisclosure(false);
  const [noteContent, setNoteContent] = useState("");
  const [noteConfidential, setNoteConfidential] = useState(true);

  const [isPending, startTransition] = useTransition();

  const openSessions = sessions.filter((s) => s.status !== "closed");
  const prayerSessions = sessions.filter((s) => s.status === "prayer");

  function handleCreateSession() {
    if (!sessionTitle.trim()) return;
    startTransition(async () => {
      try {
        await createDiscernmentSessionAction({
          title: sessionTitle.trim(),
          description: sessionDescription.trim() || null,
          date: sessionDate || null,
        });
        notifications.show({
          title: "Session created",
          message: "The discernment room is open. May wisdom guide your deliberations.",
          color: "violet",
        });
        setSessionTitle("");
        setSessionDescription("");
        setSessionDate("");
        sessionDrawer.close();
      } catch (err) {
        notifications.show({
          title: "Error",
          message: err instanceof Error ? err.message : "Something went wrong.",
          color: "red",
        });
      }
    });
  }

  function handleAddNote() {
    if (!noteContent.trim()) return;
    startTransition(async () => {
      try {
        await addElderNoteAction({
          profileId: null,
          content: noteContent.trim(),
          isConfidential: noteConfidential,
        });
        notifications.show({
          title: "Note recorded",
          message: "Your elder note has been saved.",
          color: "teal",
        });
        setNoteContent("");
        noteDrawer.close();
      } catch (err) {
        notifications.show({
          title: "Error",
          message: err instanceof Error ? err.message : "Something went wrong.",
          color: "red",
        });
      }
    });
  }

  const navItems = [
    {
      href: "/app/pastor",
      label: "Home",
      description: "Pastor overview",
      icon: BookOpen,
    },
    {
      href: "/app/elders/discernment",
      label: "Discernment Room",
      description: "Elder sessions",
      icon: Lock,
      active: true,
    },
    {
      href: "/app/council/forge",
      label: "Council Forge",
      description: "Collaborative notes",
      icon: ScrollText,
    },
  ];

  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/pastor"
      calendarHref="/app/calendar"
      sectionLabel="Elders"
      title="Discernment Room"
      description={session.appContext.church.name}
      sidebarTitle="Elders Discernment Room"
      sidebarDescription="A private space for prayer, discernment, and elder notes."
      navLabel="Leadership"
      navItems={navItems}
      topActions={
        <Group gap="xs">
          <Button
            size="xs"
            variant="light"
            color="violet"
            radius="xl"
            leftSection={<PlusCircle size={12} />}
            onClick={sessionDrawer.open}
          >
            New session
          </Button>
          <Button
            size="xs"
            variant="default"
            radius="xl"
            leftSection={<ScrollText size={12} />}
            onClick={noteDrawer.open}
          >
            Add note
          </Button>
        </Group>
      }
    >
      {/* Privacy notice */}
      <Alert
        color="orange"
        icon={<Lock size={14} />}
        variant="light"
        radius="md"
        mb="lg"
      >
        <Text fz="xs">
          This room is visible only to pastors and elders in {session.appContext.church.name}. All activity is audit logged. Confidential notes are not visible to church administrators.
        </Text>
      </Alert>

      <Tabs defaultValue="sessions" radius="xl">
        <Tabs.List>
          <Tabs.Tab value="sessions" leftSection={<BookOpen size={14} />}>
            Sessions
            {openSessions.length > 0 ? (
              <Badge color="violet" size="xs" variant="filled" ml="xs">
                {openSessions.length}
              </Badge>
            ) : null}
          </Tabs.Tab>
          <Tabs.Tab value="prayer" leftSection={<Lock size={14} />}>
            In Prayer
            {prayerSessions.length > 0 ? (
              <Badge color="orange" size="xs" variant="filled" ml="xs">
                {prayerSessions.length}
              </Badge>
            ) : null}
          </Tabs.Tab>
          <Tabs.Tab value="notes" leftSection={<ScrollText size={14} />}>
            Elder Notes
          </Tabs.Tab>
        </Tabs.List>

        {/* Sessions tab */}
        <Tabs.Panel value="sessions" pt="lg">
          {sessions.length === 0 ? (
            <Alert color="violet" variant="light" radius="md">
              <Text fz="sm" c="dimmed" ta="center" py="sm">
                No active sessions. Create a new discernment session to begin deliberating together.
              </Text>
            </Alert>
          ) : (
            <Stack gap="md">
              {openSessions.map((s) => (
                <DiscernmentSessionCard key={s.id} session={s} />
              ))}
            </Stack>
          )}
        </Tabs.Panel>

        {/* Prayer tab */}
        <Tabs.Panel value="prayer" pt="lg">
          {prayerSessions.length === 0 ? (
            <Alert color="violet" variant="light" radius="md">
              <Text fz="sm" c="dimmed" ta="center" py="sm">
                No sessions currently in prayer. Mark a session as &ldquo;In Prayer&rdquo; to gather the elders in focused intercession.
              </Text>
            </Alert>
          ) : (
            <Stack gap="md">
              {prayerSessions.map((s) => (
                <DiscernmentSessionCard key={s.id} session={s} />
              ))}
            </Stack>
          )}
        </Tabs.Panel>

        {/* Notes tab */}
        <Tabs.Panel value="notes" pt="lg">
          {recentNotes.length === 0 ? (
            <Alert color="gray" variant="light" radius="md">
              <Text fz="sm" c="dimmed" ta="center" py="sm">
                No elder notes recorded yet. Notes added here are visible only to the elder team.
              </Text>
            </Alert>
          ) : (
            <Stack gap="sm">
              {recentNotes.map((note) => (
                <ElderNoteCard key={note.id} note={note} />
              ))}
            </Stack>
          )}
        </Tabs.Panel>
      </Tabs>

      {/* Create session drawer */}
      <Drawer
        opened={sessionDrawerOpen}
        onClose={sessionDrawer.close}
        title="New Discernment Session"
        position="right"
        size="md"
        radius="lg"
      >
        <Stack gap="md" p="md">
          <Text fz="xs" c="dimmed">
            Create a private session for elder deliberation, prayer, or discernment. Only pastors and elders can view or participate.
          </Text>
          <TextInput
            label="Session title"
            placeholder="e.g. Appointment of Deacons, 2026"
            value={sessionTitle}
            onChange={(e) => setSessionTitle(e.currentTarget.value)}
            required
            radius="md"
          />
          <Textarea
            label="Description (optional)"
            placeholder="What is the nature of this discernment?"
            value={sessionDescription}
            onChange={(e) => setSessionDescription(e.currentTarget.value)}
            minRows={3}
            autosize
            radius="md"
          />
          <TextInput
            label="Scheduled date (optional)"
            type="datetime-local"
            value={sessionDate}
            onChange={(e) => setSessionDate(e.currentTarget.value)}
            radius="md"
          />
          <Divider />
          <Group justify="flex-end" gap="sm">
            <Button variant="default" radius="xl" onClick={sessionDrawer.close}>
              Cancel
            </Button>
            <Button
              color="violet"
              radius="xl"
              loading={isPending}
              disabled={!sessionTitle.trim()}
              onClick={handleCreateSession}
            >
              Create session
            </Button>
          </Group>
        </Stack>
      </Drawer>

      {/* Add elder note drawer */}
      <Drawer
        opened={noteDrawerOpen}
        onClose={noteDrawer.close}
        title="Add Elder Note"
        position="right"
        size="md"
        radius="lg"
      >
        <Stack gap="md" p="md">
          <Alert color="orange" icon={<Lock size={13} />} variant="light" radius="md">
            <Text fz="xs">
              Elder notes are visible only to pastors and elders. Confidential notes are never visible to church administrators.
            </Text>
          </Alert>
          <Textarea
            label="Note"
            placeholder="Record an observation, concern, or reflection..."
            value={noteContent}
            onChange={(e) => setNoteContent(e.currentTarget.value)}
            minRows={5}
            autosize
            radius="md"
          />
          <Select
            label="Visibility"
            value={noteConfidential ? "confidential" : "elder-visible"}
            onChange={(v) => setNoteConfidential(v === "confidential")}
            data={[
              { value: "confidential", label: "Confidential (elders only)" },
              { value: "elder-visible", label: "Elder-visible (less sensitive)" },
            ]}
            radius="md"
          />
          <Divider />
          <Group justify="flex-end" gap="sm">
            <Button variant="default" radius="xl" onClick={noteDrawer.close}>
              Cancel
            </Button>
            <Button
              color="teal"
              radius="xl"
              loading={isPending}
              disabled={!noteContent.trim()}
              onClick={handleAddNote}
            >
              Save note
            </Button>
          </Group>
        </Stack>
      </Drawer>
    </ApplicationShell>
  );
}
