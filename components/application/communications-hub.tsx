"use client";

import { useState, useTransition } from "react";
import {
  Alert,
  Badge,
  Button,
  Divider,
  Drawer,
  Group,
  MultiSelect,
  Paper,
  Select,
  Stack,
  Table,
  Tabs,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  BarChart2,
  CheckCircle,
  Mail,
  MessageSquare,
  Send,
  XCircle,
} from "lucide-react";

import { broadcastMessageAction } from "@/app/app/communications-actions";
import { ApplicationShell } from "@/components/application/app-shell";
import type { ChurchAppSession } from "@/lib/auth";
import type {
  CommunicationLogEntry,
  CommunicationsHubData,
} from "@/lib/communications-data";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

const CHANNEL_LABELS: Record<CommunicationLogEntry["channel"], string> = {
  email: "Email",
  sms: "SMS",
  push: "Push",
  in_app: "In-App",
};

const CHANNEL_COLORS: Record<CommunicationLogEntry["channel"], string> = {
  email: "blue",
  sms: "teal",
  push: "violet",
  in_app: "gray",
};

const STATUS_COLORS: Record<CommunicationLogEntry["status"], string> = {
  queued: "yellow",
  sent: "blue",
  delivered: "green",
  failed: "red",
  bounced: "orange",
};

function LogRow({ log }: { log: CommunicationLogEntry }) {
  return (
    <Table.Tr>
      <Table.Td>
        <Badge color={CHANNEL_COLORS[log.channel]} size="xs" variant="light" radius="sm">
          {CHANNEL_LABELS[log.channel]}
        </Badge>
      </Table.Td>
      <Table.Td>
        <Text fz="xs" lineClamp={1}>
          {log.subject ?? log.bodyPreview ?? "—"}
        </Text>
      </Table.Td>
      <Table.Td>
        <Text fz="xs" c="dimmed">
          {log.recipientName ?? "Broadcast"}
        </Text>
      </Table.Td>
      <Table.Td>
        <Badge color={STATUS_COLORS[log.status]} size="xs" variant="dot">
          {log.status}
        </Badge>
      </Table.Td>
      <Table.Td>
        <Text fz="xs" c="dimmed">
          {log.sentAt ? formatDate(log.sentAt) : log.scheduledFor ? `Scheduled ${formatDate(log.scheduledFor)}` : formatDate(log.createdAt)}
        </Text>
      </Table.Td>
    </Table.Tr>
  );
}

export function CommunicationsHub({
  session,
  data,
}: {
  session: ChurchAppSession;
  data: CommunicationsHubData;
}) {
  const { recentLogs, recipients } = data;

  // Compose drawer
  const [composeOpen, compose] = useDisclosure(false);
  const [channel, setChannel] = useState<"email" | "sms">("email");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [filterRole, setFilterRole] = useState<string | null>(null);
  const [scheduledFor, setScheduledFor] = useState("");

  const [isPending, startTransition] = useTransition();

  const navItems = [
    {
      href: "/app/pastor",
      label: "Home",
      description: "Pastor overview",
      icon: Mail,
    },
    {
      href: "/app/communications",
      label: "Communications",
      description: "Messages & notifications",
      icon: Send,
      active: true,
    },
    {
      href: "/app/reports",
      label: "Reports",
      description: "Members, events, giving",
      icon: BarChart2,
    },
  ];

  // Filter recipients by role if set
  const filteredRecipients = filterRole
    ? recipients.filter((r) => r.role === filterRole)
    : recipients;

  const recipientOptions = filteredRecipients.map((r) => ({
    value: r.profileId,
    label: `${r.name} (${r.email ?? r.phone ?? "no contact"})`,
  }));

  // Consent-warning counts
  const selectedRecipients = recipients.filter((r) => selectedIds.includes(r.profileId));
  const noContactCount = selectedRecipients.filter(
    (r) => (channel === "email" ? !r.email : !r.phone),
  ).length;
  const optedOutCount = selectedRecipients.filter(
    (r) => (channel === "email" ? !r.emailOptIn : !r.smsOptIn),
  ).length;

  function handleSelectAll() {
    setSelectedIds(filteredRecipients.map((r) => r.profileId));
  }

  function handleClearSelection() {
    setSelectedIds([]);
  }

  function handleSend() {
    if (!body.trim() || selectedIds.length === 0) return;

    startTransition(async () => {
      try {
        const result = await broadcastMessageAction(recipients, {
          recipientIds: selectedIds,
          channel,
          subject: subject.trim() || undefined,
          body: body.trim(),
          scheduledFor: scheduledFor || undefined,
        });

        notifications.show({
          title: "Message dispatched",
          message: `Sent: ${result.sent} · Skipped (consent): ${result.skipped} · Errors: ${result.errors}`,
          color: result.errors > 0 ? "orange" : "teal",
        });

        setBody("");
        setSubject("");
        setSelectedIds([]);
        setScheduledFor("");
        compose.close();
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
    <ApplicationShell
      session={session}
      workspaceHref="/app/pastor"
      calendarHref="/app/calendar"
      sectionLabel="Communications"
      title="Communications Hub"
      description={session.appContext.church.name}
      sidebarTitle="Communications Hub"
      sidebarDescription="Compose and track messages to your congregation."
      navLabel="Leadership"
      navItems={navItems}
      topActions={
        <Button
          size="xs"
          variant="filled"
          color="blue"
          radius="xl"
          leftSection={<Send size={12} />}
          onClick={compose.open}
        >
          Compose
        </Button>
      }
    >
      <Tabs defaultValue="log" radius="xl">
        <Tabs.List>
          <Tabs.Tab value="log" leftSection={<Mail size={14} />}>
            Message Log
            {recentLogs.length > 0 ? (
              <Badge color="blue" size="xs" variant="filled" ml="xs">
                {recentLogs.length}
              </Badge>
            ) : null}
          </Tabs.Tab>
          <Tabs.Tab value="members" leftSection={<MessageSquare size={14} />}>
            Members
          </Tabs.Tab>
        </Tabs.List>

        {/* Message log tab */}
        <Tabs.Panel value="log" pt="lg">
          {recentLogs.length === 0 ? (
            <Alert color="blue" variant="light" radius="md">
              <Text fz="sm" c="dimmed" ta="center" py="sm">
                No messages sent yet. Use Compose to send your first message.
              </Text>
            </Alert>
          ) : (
            <Paper withBorder radius="md" style={{ overflow: "hidden" }}>
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Channel</Table.Th>
                    <Table.Th>Message</Table.Th>
                    <Table.Th>Recipient</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Date</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {recentLogs.map((log) => (
                    <LogRow key={log.id} log={log} />
                  ))}
                </Table.Tbody>
              </Table>
            </Paper>
          )}
        </Tabs.Panel>

        {/* Members tab */}
        <Tabs.Panel value="members" pt="lg">
          <Stack gap="sm">
            {recipients.map((r) => (
              <Paper key={r.profileId} withBorder p="sm" radius="md">
                <Group justify="space-between">
                  <Stack gap={2}>
                    <Text fz="sm" fw={600}>
                      {r.name}
                    </Text>
                    <Text fz="xs" c="dimmed">
                      {r.email ?? r.phone ?? "No contact info"} · {r.role}
                    </Text>
                    {r.ministries.length > 0 ? (
                      <Text fz="xs" c="dimmed">
                        {r.ministries.join(", ")}
                      </Text>
                    ) : null}
                  </Stack>
                  <Group gap="xs">
                    {r.emailOptIn ? (
                      <Badge size="xs" color="blue" variant="light" leftSection={<CheckCircle size={10} />}>
                        Email
                      </Badge>
                    ) : (
                      <Badge size="xs" color="gray" variant="light" leftSection={<XCircle size={10} />}>
                        No email
                      </Badge>
                    )}
                    {r.smsOptIn ? (
                      <Badge size="xs" color="teal" variant="light" leftSection={<CheckCircle size={10} />}>
                        SMS
                      </Badge>
                    ) : (
                      <Badge size="xs" color="gray" variant="light" leftSection={<XCircle size={10} />}>
                        No SMS
                      </Badge>
                    )}
                  </Group>
                </Group>
              </Paper>
            ))}
          </Stack>
        </Tabs.Panel>
      </Tabs>

      {/* Compose drawer */}
      <Drawer
        opened={composeOpen}
        onClose={compose.close}
        title="Compose Message"
        position="right"
        size="lg"
        radius="lg"
      >
        <Stack gap="md" p="md">
          <Select
            label="Channel"
            value={channel}
            onChange={(v) => setChannel((v ?? "email") as "email" | "sms")}
            data={[
              { value: "email", label: "Email" },
              { value: "sms", label: "SMS" },
            ]}
            radius="md"
          />

          {/* Recipient filter + picker */}
          <Select
            label="Filter by role (optional)"
            value={filterRole}
            onChange={setFilterRole}
            clearable
            data={[
              { value: "pastor", label: "Pastors" },
              { value: "church_admin", label: "Administrators" },
              { value: "ministry_leader", label: "Ministry Leaders" },
              { value: "member", label: "Members" },
            ]}
            radius="md"
          />
          <Group gap="xs" align="flex-end">
            <MultiSelect
              label="Recipients"
              placeholder="Search members…"
              data={recipientOptions}
              value={selectedIds}
              onChange={setSelectedIds}
              searchable
              radius="md"
              style={{ flex: 1 }}
            />
          </Group>
          <Group gap="xs">
            <Button size="xs" variant="light" radius="xl" onClick={handleSelectAll}>
              Select all ({filteredRecipients.length})
            </Button>
            {selectedIds.length > 0 ? (
              <Button size="xs" variant="subtle" color="gray" radius="xl" onClick={handleClearSelection}>
                Clear
              </Button>
            ) : null}
          </Group>

          {selectedIds.length > 0 && (noContactCount > 0 || optedOutCount > 0) ? (
            <Alert color="orange" variant="light" radius="md">
              <Text fz="xs">
                {noContactCount > 0 ? `${noContactCount} recipient(s) have no ${channel} address and will be skipped. ` : ""}
                {optedOutCount > 0 ? `${optedOutCount} recipient(s) have opted out of ${channel} and will be skipped.` : ""}
              </Text>
            </Alert>
          ) : null}

          {channel === "email" ? (
            <TextInput
              label="Subject"
              placeholder="e.g. Sunday Service Reminder"
              value={subject}
              onChange={(e) => setSubject(e.currentTarget.value)}
              radius="md"
            />
          ) : null}

          <Textarea
            label="Message"
            placeholder="Write your message here…"
            value={body}
            onChange={(e) => setBody(e.currentTarget.value)}
            minRows={5}
            autosize
            radius="md"
          />

          <TextInput
            label="Schedule for (optional)"
            type="datetime-local"
            value={scheduledFor}
            onChange={(e) => setScheduledFor(e.currentTarget.value)}
            radius="md"
          />

          <Divider />
          <Group justify="flex-end" gap="sm">
            <Button variant="default" radius="xl" onClick={compose.close}>
              Cancel
            </Button>
            <Button
              color="blue"
              radius="xl"
              loading={isPending}
              disabled={!body.trim() || selectedIds.length === 0}
              leftSection={<Send size={12} />}
              onClick={handleSend}
            >
              Send to {selectedIds.length} recipient{selectedIds.length !== 1 ? "s" : ""}
            </Button>
          </Group>
        </Stack>
      </Drawer>
    </ApplicationShell>
  );
}
