"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Alert,
  Badge,
  Button,
  Group,
  Paper,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { Mail, RefreshCcw, Send, XCircle } from "lucide-react";

import {
  cancelScheduledMessageAction,
  retryCommunicationAction,
} from "@/app/app/communications-actions";
import { ApplicationShell } from "@/components/application/app-shell";
import type { ChurchAppSession } from "@/lib/auth";
import type { CommunicationLogSummary } from "@/lib/communications-types";

const navItems = [
  {
    href: "/app/communications/history",
    label: "Message History",
    description: "All sent and scheduled messages",
    icon: Mail,
    active: true,
  },
  {
    href: "/app/communications/compose",
    label: "Compose",
    description: "Send a new message",
    icon: Send,
  },
  {
    href: "/app/communications/templates",
    label: "Templates",
    description: "Manage message templates",
    icon: Mail,
  },
];

const CHANNEL_COLORS: Record<string, string> = {
  email: "blue",
  sms: "teal",
};

const STATUS_COLORS: Record<string, string> = {
  sent: "green",
  delivered: "green",
  scheduled: "blue",
  failed: "red",
  bounced: "red",
  cancelled: "gray",
  queued: "yellow",
  sending: "yellow",
  suppressed: "grape",
  unsubscribed: "grape",
  draft: "gray",
};

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function CommunicationsHistoryWorkspace({
  session,
  logs,
}: {
  session: ChurchAppSession;
  logs: CommunicationLogSummary[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [actionFeedback, setActionFeedback] = useState<{
    color: string;
    message: string;
  } | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  function handleCancel(logId: string) {
    setProcessingId(logId);
    setActionFeedback(null);
    startTransition(async () => {
      const result = await cancelScheduledMessageAction(logId);
      if (!result.ok) {
        setActionFeedback({ color: "red", message: result.error });
      } else {
        setActionFeedback({ color: "teal", message: "Message cancelled successfully." });
        router.refresh();
      }
      setProcessingId(null);
    });
  }

  function handleRetry(logId: string) {
    setProcessingId(logId);
    setActionFeedback(null);
    startTransition(async () => {
      const result = await retryCommunicationAction({ logId });
      if (!result.retried) {
        setActionFeedback({
          color: "orange",
          message: result.reason ?? "Message not eligible for retry.",
        });
      } else {
        setActionFeedback({ color: "teal", message: "Message queued for retry." });
        router.refresh();
      }
      setProcessingId(null);
    });
  }

  return (
    <ApplicationShell
      session={session}
      workspaceHref={session.homePath}
      calendarHref="/app/calendar"
      sectionLabel="Communications"
      title="Message History"
      description={session.appContext.church.name}
      sidebarTitle="Communications"
      sidebarDescription="Send and manage messages"
      navLabel="Communications"
      navItems={navItems}
    >
      <Stack gap="lg">
        <Group justify="space-between" align="center">
          <Title order={2} fw={700} c="#101827">
            Message History
          </Title>
          <Button
            component={Link}
            href="/app/communications/compose"
            variant="filled"
            color="blue"
            size="xs"
            radius="xl"
            leftSection={<Send size={12} />}
          >
            New Message
          </Button>
        </Group>

        {actionFeedback ? (
          <Alert color={actionFeedback.color} variant="light" radius="md" withCloseButton onClose={() => setActionFeedback(null)}>
            {actionFeedback.message}
          </Alert>
        ) : null}

        {logs.length === 0 ? (
          <Paper withBorder p="xl" radius="lg">
            <Stack align="center" gap="sm" py="lg">
              <Text c="dimmed" ta="center">
                No messages sent yet.
              </Text>
              <Button
                component={Link}
                href="/app/communications/compose"
                variant="light"
                size="sm"
                radius="xl"
              >
                Send your first message
              </Button>
            </Stack>
          </Paper>
        ) : (
          <Paper withBorder radius="md" style={{ overflow: "hidden" }}>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Subject / Preview</Table.Th>
                  <Table.Th>Channel</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Sent by</Table.Th>
                  <Table.Th>Date</Table.Th>
                  <Table.Th>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {logs.map((log) => (
                  <Table.Tr
                    key={log.id}
                    style={{ cursor: "pointer" }}
                    onClick={() => router.push(`/app/communications/history/${log.id}`)}
                  >
                    <Table.Td>
                      <Text fz="sm" lineClamp={1}>
                        {log.subject ?? log.bodyPreview ?? "-"}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge
                        color={CHANNEL_COLORS[log.channel] ?? "gray"}
                        size="xs"
                        variant="light"
                        radius="sm"
                      >
                        {log.channel.toUpperCase()}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Badge
                        color={STATUS_COLORS[log.status] ?? "gray"}
                        size="xs"
                        variant="dot"
                      >
                        {log.status}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text fz="xs" c="dimmed">
                        {log.sentByName ?? "—"}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text fz="xs" c="dimmed">
                        {log.sentAt
                          ? formatDate(log.sentAt)
                          : log.scheduledFor
                            ? `Scheduled: ${formatDate(log.scheduledFor)}`
                            : formatDate(log.createdAt)}
                      </Text>
                    </Table.Td>
                    <Table.Td onClick={(e) => e.stopPropagation()}>
                      <Group gap="xs" wrap="nowrap">
                        {log.status === "scheduled" ? (
                          <Button
                            size="compact-xs"
                            variant="light"
                            color="gray"
                            leftSection={<XCircle size={12} />}
                            loading={processingId === log.id && isPending}
                            onClick={() => handleCancel(log.id)}
                          >
                            Cancel
                          </Button>
                        ) : null}
                        {(log.status === "failed" || log.status === "bounced") &&
                        log.retryCount < 3 ? (
                          <Button
                            size="compact-xs"
                            variant="light"
                            color="teal"
                            leftSection={<RefreshCcw size={12} />}
                            loading={processingId === log.id && isPending}
                            onClick={() => handleRetry(log.id)}
                          >
                            Retry
                          </Button>
                        ) : null}
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Paper>
        )}
      </Stack>
    </ApplicationShell>
  );
}
