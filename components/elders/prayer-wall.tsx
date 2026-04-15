"use client";

import { useState, useTransition } from "react";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Divider,
  Group,
  Modal,
  Paper,
  Stack,
  Text,
  Textarea,
  TextInput,
  ThemeIcon,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { Hand, Heart, Lock, PlusCircle, User } from "lucide-react";

import { addPrayerRequestAction, markPrayedAction } from "@/app/app/elders-actions";
import type { PrayerRequest } from "@/lib/elders-types";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function PrayerRequestCard({
  request,
  churchId,
}: {
  request: PrayerRequest;
  churchId: string;
}) {
  const [hasPrayed, setHasPrayed] = useState(request.hasPrayed);
  const [prayedCount, setPrayedCount] = useState(request.prayedCount);
  const [isPending, startTransition] = useTransition();

  function handlePrayed() {
    if (hasPrayed) return; // already acknowledged
    startTransition(async () => {
      try {
        await markPrayedAction({
          prayerRequestId: request.id,
          churchId,
        });
        setHasPrayed(true);
        setPrayedCount((c) => c + 1);
        notifications.show({
          title: "Amen",
          message: "Your prayer has been recorded. May God hear our collective cry.",
          color: "violet",
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

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="xs">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Stack gap={2} style={{ flex: 1 }}>
            <Text fw={600} fz="sm">
              {request.title}
            </Text>
            {request.description ? (
              <Text fz="xs" c="dimmed" style={{ whiteSpace: "pre-wrap" }}>
                {request.description}
              </Text>
            ) : null}
          </Stack>
          {request.isAnonymous ? (
            <Badge
              leftSection={<Lock size={9} />}
              size="xs"
              color="gray"
              variant="light"
            >
              Anonymous
            </Badge>
          ) : null}
        </Group>

        <Group justify="space-between" align="center">
          <Group gap="xs">
            {!request.isAnonymous && request.requestedByName ? (
              <>
                <User size={11} color="var(--mantine-color-dimmed)" />
                <Text fz="xs" c="dimmed">
                  {request.requestedByName}
                </Text>
                <Text fz="xs" c="dimmed">
                  ·
                </Text>
              </>
            ) : null}
            <Text fz="xs" c="dimmed">
              {formatDate(request.createdAt)}
            </Text>
          </Group>

          <Group gap="sm" align="center">
            <Group gap={4} align="center">
              <Heart
                size={13}
                color={
                  prayedCount > 0
                    ? "var(--mantine-color-violet-5)"
                    : "var(--mantine-color-dimmed)"
                }
                fill={prayedCount > 0 ? "var(--mantine-color-violet-5)" : "none"}
              />
              <Text fz="xs" c="dimmed">
                {prayedCount}
              </Text>
            </Group>

            <Button
              size="xs"
              variant={hasPrayed ? "filled" : "light"}
              color="violet"
              radius="xl"
              leftSection={<Hand size={12} />}
              loading={isPending}
              disabled={hasPrayed}
              onClick={handlePrayed}
            >
              {hasPrayed ? "Prayed" : "I Prayed"}
            </Button>
          </Group>
        </Group>
      </Stack>
    </Paper>
  );
}

export function PrayerWall({
  sessionId,
  churchId,
  requests,
}: {
  sessionId: string;
  churchId: string;
  requests: PrayerRequest[];
}) {
  const [opened, { open, close }] = useDisclosure(false);
  const [isPending, startTransition] = useTransition();

  // Add request form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);

  function handleAdd() {
    if (!title.trim()) return;
    startTransition(async () => {
      try {
        await addPrayerRequestAction({
          sessionId,
          title,
          description: description.trim() || null,
          isAnonymous,
        });
        notifications.show({
          title: "Prayer request added",
          message: "May the Lord hear the prayers of his people.",
          color: "violet",
        });
        setTitle("");
        setDescription("");
        setIsAnonymous(false);
        close();
      } catch (err) {
        notifications.show({
          title: "Error",
          message: err instanceof Error ? err.message : "Something went wrong.",
          color: "red",
        });
      }
    });
  }

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Group gap="xs">
          <ThemeIcon variant="light" color="violet" size="sm" radius="xl">
            <Hand size={13} />
          </ThemeIcon>
          <Text fw={600} fz="sm">
            Prayer Wall
          </Text>
          {requests.length > 0 && (
            <Badge color="violet" size="xs" variant="dot">
              {requests.length}
            </Badge>
          )}
        </Group>
        <Button
          size="xs"
          variant="light"
          color="violet"
          radius="xl"
          leftSection={<PlusCircle size={12} />}
          onClick={open}
        >
          Add request
        </Button>
      </Group>

      {requests.length === 0 ? (
        <Alert color="violet" variant="light" radius="md">
          <Text fz="sm" c="dimmed" ta="center" py="xs">
            Gather in prayer. No requests have been added yet — be the first to seek the Lord together.
          </Text>
        </Alert>
      ) : (
        <Stack gap="sm">
          {requests.map((req) => (
            <PrayerRequestCard key={req.id} request={req} churchId={churchId} />
          ))}
        </Stack>
      )}

      {/* Add prayer request modal */}
      <Modal
        opened={opened}
        onClose={close}
        title="Add Prayer Request"
        radius="lg"
        size="md"
        centered
      >
        <Stack gap="md">
          <Text fz="xs" c="dimmed">
            Share a prayer concern with the elder team. Prayer requests within this room are visible only to leaders and elders in your church.
          </Text>

          <TextInput
            label="Title"
            placeholder="What do we bring before the Lord?"
            value={title}
            onChange={(e) => setTitle(e.currentTarget.value)}
            required
            radius="md"
          />

          <Textarea
            label="Additional details (optional)"
            placeholder="Provide context the elders may need..."
            value={description}
            onChange={(e) => setDescription(e.currentTarget.value)}
            minRows={3}
            autosize
            radius="md"
          />

          <Checkbox
            label="Submit anonymously"
            description="Your name will not be shown with this request."
            checked={isAnonymous}
            onChange={(e) => setIsAnonymous(e.currentTarget.checked)}
            color="violet"
          />

          <Divider />

          <Group justify="flex-end" gap="sm">
            <Button variant="default" radius="xl" onClick={close}>
              Cancel
            </Button>
            <Button
              color="violet"
              radius="xl"
              loading={isPending}
              disabled={!title.trim()}
              onClick={handleAdd}
            >
              Add prayer request
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
