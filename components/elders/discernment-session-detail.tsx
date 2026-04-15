"use client";

import { useState, useTransition } from "react";
import {
  Alert,
  Badge,
  Button,
  Divider,
  Group,
  Paper,
  Select,
  Stack,
  Text,
  Textarea,
  ThemeIcon,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { BookOpen, Lock, MessageSquare } from "lucide-react";

import { updateDiscernmentSessionStatusAction } from "@/app/app/elders-actions";
import { AiWisdomPrompt } from "@/components/elders/ai-wisdom-prompt";
import { PrayerWall } from "@/components/elders/prayer-wall";
import { ApplicationShell } from "@/components/application/app-shell";
import type { ChurchAppSession } from "@/lib/auth";
import type { DiscernmentSessionDetail, ElderNote } from "@/lib/elders-types";
import {
  SESSION_STATUS_COLOR,
  SESSION_STATUS_LABEL,
} from "@/lib/elders-types";

function formatDate(value: string | null): string {
  if (!value) return "Date TBD";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function ElderNoteRow({ note }: { note: ElderNote }) {
  return (
    <Paper withBorder p="sm" radius="md">
      <Stack gap={4}>
        <Group justify="space-between">
          <Text fz="xs" c="dimmed">
            {note.createdByName ?? "Elder"} · {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(note.createdAt))}
          </Text>
          {note.isConfidential ? (
            <Badge size="xs" color="orange" variant="light" leftSection={<Lock size={9} />}>
              Confidential
            </Badge>
          ) : null}
        </Group>
        <Text fz="sm" style={{ whiteSpace: "pre-wrap" }}>
          {note.content}
        </Text>
      </Stack>
    </Paper>
  );
}

export function DiscernmentSessionDetailView({
  session,
  detail,
}: {
  session: ChurchAppSession;
  detail: DiscernmentSessionDetail;
}) {
  const { session: ds, prayerRequests, elderNotes } = detail;
  const churchId = session.appContext.church.id;

  const [currentStatus, setCurrentStatus] = useState(ds.status);
  const [outcome, setOutcome] = useState(ds.outcome ?? "");
  const [isPending, startTransition] = useTransition();

  function handleStatusUpdate() {
    startTransition(async () => {
      try {
        await updateDiscernmentSessionStatusAction({
          sessionId: ds.id,
          status: currentStatus,
          outcome: outcome.trim() || null,
        });
        notifications.show({
          title: "Session updated",
          message: "The discernment session status has been recorded.",
          color: "teal",
        });
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
    { href: "/app/pastor", label: "Home", description: "Pastor overview", icon: BookOpen },
    {
      href: "/app/elders/discernment",
      label: "Discernment Room",
      description: "All sessions",
      icon: Lock,
    },
  ];

  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/pastor"
      calendarHref="/app/calendar"
      sectionLabel="Elders"
      title={ds.title}
      description={session.appContext.church.name}
      sidebarTitle="Discernment Session"
      sidebarDescription="Prayer, deliberation, and elder discernment."
      navLabel="Leadership"
      navItems={navItems}
      topActions={
        <AiWisdomPrompt sessionId={ds.id} sessionTitle={ds.title} />
      }
    >
      {/* Session header */}
      <Paper withBorder p="lg" radius="lg" mb="lg">
        <Stack gap="sm">
          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <Stack gap={4} style={{ flex: 1 }}>
              <Group gap="xs">
                <ThemeIcon
                  variant="light"
                  color={SESSION_STATUS_COLOR[ds.status]}
                  size="sm"
                  radius="xl"
                >
                  <BookOpen size={13} />
                </ThemeIcon>
                <Badge
                  color={SESSION_STATUS_COLOR[currentStatus]}
                  variant="light"
                  size="sm"
                  radius="xl"
                >
                  {SESSION_STATUS_LABEL[currentStatus]}
                </Badge>
              </Group>
              {ds.date ? (
                <Text fz="xs" c="dimmed">
                  {formatDate(ds.date)}
                </Text>
              ) : null}
              {ds.description ? (
                <Text fz="sm" c="dimmed">
                  {ds.description}
                </Text>
              ) : null}
            </Stack>
          </Group>

          {/* Status controls */}
          <Divider />
          <Group gap="md" align="flex-end" wrap="wrap">
            <Select
              label="Session status"
              value={currentStatus}
              onChange={(v) =>
                setCurrentStatus(
                  (v as typeof currentStatus) ?? ds.status,
                )
              }
              data={[
                { value: "open", label: "Open" },
                { value: "prayer", label: "In Prayer" },
                { value: "voting", label: "Voting" },
                { value: "closed", label: "Closed" },
              ]}
              size="xs"
              radius="md"
              style={{ minWidth: 160 }}
            />
            {currentStatus === "closed" ? (
              <Textarea
                label="Outcome (optional)"
                placeholder="Record the outcome or resolution..."
                value={outcome}
                onChange={(e) => setOutcome(e.currentTarget.value)}
                minRows={2}
                autosize
                radius="md"
                style={{ flex: 1, minWidth: 240 }}
                size="xs"
              />
            ) : null}
            <Button
              size="xs"
              variant="light"
              color="teal"
              radius="xl"
              loading={isPending}
              onClick={handleStatusUpdate}
              style={{ alignSelf: "flex-end" }}
            >
              Save status
            </Button>
          </Group>
        </Stack>
      </Paper>

      <Group align="flex-start" gap="lg" wrap="wrap">
        {/* Prayer Wall — main column */}
        <Stack gap="md" style={{ flex: 2, minWidth: 280 }}>
          <PrayerWall
            sessionId={ds.id}
            churchId={churchId}
            requests={prayerRequests}
          />
        </Stack>

        {/* Elder Notes — sidebar column */}
        <Stack gap="md" style={{ flex: 1, minWidth: 240 }}>
          <Group gap="xs">
            <ThemeIcon variant="light" color="orange" size="sm" radius="xl">
              <MessageSquare size={13} />
            </ThemeIcon>
            <Text fw={600} fz="sm">
              Elder Notes
            </Text>
            <Badge size="xs" color="orange" variant="light">
              {elderNotes.length}
            </Badge>
          </Group>

          {elderNotes.length === 0 ? (
            <Alert color="gray" variant="light" radius="md">
              <Text fz="xs" c="dimmed">
                No elder notes recorded. Add a note from the Discernment Room.
              </Text>
            </Alert>
          ) : (
            <Stack gap="xs">
              {elderNotes.map((note) => (
                <ElderNoteRow key={note.id} note={note} />
              ))}
            </Stack>
          )}
        </Stack>
      </Group>
    </ApplicationShell>
  );
}
