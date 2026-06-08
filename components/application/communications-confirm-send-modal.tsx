"use client";

import { Badge, Button, Group, Modal, Stack, Text } from "@mantine/core";

import type { CommunicationChannel } from "@/lib/communications-types";

const CHANNEL_COLORS: Record<CommunicationChannel, string> = {
  email: "blue",
  sms: "teal",
};

function formatScheduledTime(iso: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function CommunicationsConfirmSendModal({
  opened,
  recipientCount,
  channel,
  scheduledFor,
  churchTimezone,
  onConfirm,
  onClose,
  loading,
}: {
  opened: boolean;
  recipientCount: number;
  channel: CommunicationChannel;
  scheduledFor: string | null;
  churchTimezone: string;
  onConfirm: () => void;
  onClose: () => void;
  loading: boolean;
}) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Confirm send"
      centered
      size="sm"
    >
      <Stack gap="md">
        <Group gap="xs">
          <Badge color={CHANNEL_COLORS[channel]} variant="filled" size="md">
            {channel.toUpperCase()}
          </Badge>
        </Group>

        <Text size="sm">
          This message will be sent to{" "}
          <Text component="span" fw={700}>
            {recipientCount} recipient{recipientCount === 1 ? "" : "s"}
          </Text>
          .
        </Text>

        <Text size="sm" c="dimmed">
          {scheduledFor
            ? `Scheduled for: ${formatScheduledTime(scheduledFor, churchTimezone)}`
            : "Sending now"}
        </Text>

        <Text size="xs" c="dimmed">
          The full message body is not stored after sending.
        </Text>

        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="filled"
            color="blue"
            onClick={onConfirm}
            loading={loading}
            disabled={loading}
          >
            {scheduledFor ? "Schedule" : "Send now"}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
