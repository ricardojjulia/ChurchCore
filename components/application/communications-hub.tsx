"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
  RefreshCcw,
  Send,
  ShieldBan,
  Timer,
  XCircle,
} from "lucide-react";

import {
  broadcastMessageAction,
  getCommunicationDeliveryEventsAction,
  retryCommunicationAction,
  suppressContactAction,
} from "@/app/app/communications-actions";
import { ApplicationShell } from "@/components/application/app-shell";
import { ReadinessTargetState } from "@/components/application/readiness-target-state";
import type { ChurchAppSession } from "@/lib/auth";
import { shouldRetryDelivery } from "@/lib/communications/provider-adapter";
import type {
  CommunicationDeliveryEvent,
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
  draft: "gray",
  queued: "yellow",
  scheduled: "yellow",
  sending: "yellow",
  sent: "blue",
  delivered: "green",
  failed: "red",
  bounced: "orange",
  suppressed: "grape",
  unsubscribed: "grape",
  cancelled: "gray",
};

function isRetryEligible(log: CommunicationLogEntry): boolean {
  if (log.retryCount >= 3) {
    return false;
  }

  return shouldRetryDelivery(log.status, log.errorCode ?? undefined);
}

export function CommunicationsHub({
  session,
  data,
  readinessView = false,
  dataSource = "live",
}: {
  session: ChurchAppSession;
  data: CommunicationsHubData;
  readinessView?: boolean;
  dataSource?: "preview" | "live";
}) {
  const router = useRouter();
  const { recentLogs, recipients, suppressions } = data;

  const [isPending, startTransition] = useTransition();

  // Compose state
  const [composeOpen, compose] = useDisclosure(false);
  const [channel, setChannel] = useState<"email" | "sms">("email");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [filterRole, setFilterRole] = useState<string | null>(null);
  const [scheduledFor, setScheduledFor] = useState("");

  // Suppression drawer state
  const [suppressionOpen, suppression] = useDisclosure(false);
  const [suppressionChannel, setSuppressionChannel] = useState<"email" | "sms">("email");
  const [suppressionContact, setSuppressionContact] = useState("");
  const [suppressionNotes, setSuppressionNotes] = useState("");

  // Delivery events drawer state
  const [eventsOpen, events] = useDisclosure(false);
  const [activeLog, setActiveLog] = useState<CommunicationLogEntry | null>(null);
  const [activeEvents, setActiveEvents] = useState<CommunicationDeliveryEvent[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [retryingLogId, setRetryingLogId] = useState<string | null>(null);

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

  const filteredRecipients = filterRole
    ? recipients.filter((recipient) => recipient.role === filterRole)
    : recipients;

  const recipientOptions = useMemo(
    () =>
      filteredRecipients.map((recipient) => ({
        value: recipient.profileId,
        label: `${recipient.name} (${recipient.email ?? recipient.phone ?? "no contact"})`,
      })),
    [filteredRecipients],
  );

  const selectedRecipients = recipients.filter((recipient) => selectedIds.includes(recipient.profileId));
  const noContactCount = selectedRecipients.filter(
    (recipient) => (channel === "email" ? !recipient.email : !recipient.phone),
  ).length;
  const optedOutCount = selectedRecipients.filter(
    (recipient) => (channel === "email" ? !recipient.emailOptIn : !recipient.smsOptIn),
  ).length;

  const pendingCount = recentLogs.filter(
    (log) => log.status === "queued" || log.status === "scheduled" || log.status === "sending",
  ).length;
  const unresolvedDeliveryLogs = recentLogs.filter(
    (log) =>
      log.status === "failed" ||
      log.status === "bounced" ||
      log.status === "suppressed" ||
      log.status === "unsubscribed",
  );
  const unresolvedRetryableCount = unresolvedDeliveryLogs.filter((log) => isRetryEligible(log)).length;
  const failedCount = recentLogs.filter((log) => log.status === "failed").length;
  const bouncedCount = recentLogs.filter((log) => log.status === "bounced").length;
  const suppressedContacts = suppressions.length;
  const contactGapCount = recipients.filter((recipient) => !recipient.email && !recipient.phone).length;
  const consentGapCount = recipients.filter(
    (recipient) => !recipient.emailOptIn && !recipient.smsOptIn,
  ).length;

  const readinessIssueCount =
    pendingCount +
    failedCount +
    bouncedCount +
    suppressedContacts +
    contactGapCount +
    consentGapCount;

  const readinessState =
    dataSource === "preview"
      ? {
          state: "no-backend" as const,
          title: "Communications target unavailable",
          description:
            "Communications readiness can be previewed, but live sends, delivery failures, suppressions, consent, and contact checks need tenant data.",
          detail: "Configure the tenant backend before using this target to clear readiness.",
        }
      : recipients.length === 0 && recentLogs.length === 0
        ? {
            state: "empty" as const,
            title: "No communications data yet",
            description:
              "Add recipients or send a message before using communications readiness as an operational signal.",
          }
        : readinessIssueCount === 0
          ? {
              state: "completed" as const,
              title: "Communications readiness is clear",
              description:
                "No queued sends, failed delivery, bounced messages, suppressions, missing contacts, or consent gaps need review.",
            }
          : {
              state: "validation-error" as const,
              title: "Communications readiness needs attention",
              description:
                "Resolve pending sends, delivery failures, bounces, suppressions, missing contacts, or consent gaps before communications readiness is complete.",
              detail: `${readinessIssueCount} item${readinessIssueCount === 1 ? "" : "s"} need review.`,
            };

  function handleSelectAll() {
    setSelectedIds(filteredRecipients.map((recipient) => recipient.profileId));
  }

  function handleClearSelection() {
    setSelectedIds([]);
  }

  function handleSend() {
    if (!body.trim() || selectedIds.length === 0) {
      return;
    }

    if (channel === "email" && !subject.trim()) {
      notifications.show({
        title: "Missing subject",
        message: "Email broadcasts require a subject.",
        color: "yellow",
      });
      return;
    }

    if (scheduledFor) {
      const parsed = new Date(scheduledFor);
      if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) {
        notifications.show({
          title: "Invalid schedule",
          message: "Choose a future schedule time.",
          color: "yellow",
        });
        return;
      }
    }

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
          message: `Sent: ${result.sent} · Skipped: ${result.skipped} · Errors: ${result.errors}`,
          color: result.errors > 0 ? "orange" : "teal",
        });

        setBody("");
        setSubject("");
        setSelectedIds([]);
        setScheduledFor("");
        compose.close();
        router.refresh();
      } catch (error) {
        notifications.show({
          title: "Error",
          message: error instanceof Error ? error.message : "Something went wrong.",
          color: "red",
        });
      }
    });
  }

  function handleRetry(log: CommunicationLogEntry) {
    setRetryingLogId(log.id);

    startTransition(async () => {
      try {
        const result = await retryCommunicationAction({ logId: log.id });

        if (!result.retried) {
          notifications.show({
            title: "Retry skipped",
            message: result.reason ?? "This communication cannot be retried.",
            color: "yellow",
          });
        } else {
          notifications.show({
            title: "Retry queued",
            message: "A new delivery attempt has been logged.",
            color: "teal",
          });
        }

        router.refresh();
      } catch (error) {
        notifications.show({
          title: "Retry failed",
          message: error instanceof Error ? error.message : "Unable to retry this communication.",
          color: "red",
        });
      } finally {
        setRetryingLogId(null);
      }
    });
  }

  function handleOpenEvents(log: CommunicationLogEntry) {
    setActiveLog(log);
    setActiveEvents([]);
    setIsLoadingEvents(true);
    events.open();

    startTransition(async () => {
      try {
        const deliveryEvents = await getCommunicationDeliveryEventsAction({ logId: log.id });
        setActiveEvents(deliveryEvents);
      } catch (error) {
        notifications.show({
          title: "Unable to load events",
          message: error instanceof Error ? error.message : "Could not load delivery events.",
          color: "red",
        });
      } finally {
        setIsLoadingEvents(false);
      }
    });
  }

  function handleAddSuppression() {
    if (!suppressionContact.trim()) {
      notifications.show({
        title: "Missing contact",
        message: "Provide an email address or phone number.",
        color: "yellow",
      });
      return;
    }

    startTransition(async () => {
      try {
        await suppressContactAction({
          channel: suppressionChannel,
          contact: suppressionContact.trim(),
          reason: "manual",
          notes: suppressionNotes.trim() || undefined,
        });

        notifications.show({
          title: "Suppression saved",
          message: `${suppressionChannel.toUpperCase()} contact is now suppressed for this church.`,
          color: "teal",
        });

        setSuppressionContact("");
        setSuppressionNotes("");
        suppression.close();
        router.refresh();
      } catch (error) {
        notifications.show({
          title: "Suppression failed",
          message: error instanceof Error ? error.message : "Unable to save suppression.",
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
      {readinessView ? (
        <Stack gap="md" mb="lg">
          <Paper withBorder radius="lg" p="md" bg="#f8fbff">
            <Group justify="space-between" gap="md" align="flex-start">
              <div>
                <Text fw={700} size="sm">
                  Readiness view: communications delivery and consent.
                </Text>
                <Text size="sm" c="dimmed" mt={4}>
                  {readinessIssueCount > 0
                    ? `${readinessIssueCount} item${readinessIssueCount === 1 ? "" : "s"} need review across sends, bounces, suppressions, contacts, and consent.`
                    : "Queued sends, failed delivery, bounces, suppressions, contact gaps, and consent gaps are clear."}
                </Text>
              </div>
              <Text component="a" href="/app/church-admin/readiness" size="sm" fw={700} c="churchBlue">
                Back to readiness
              </Text>
            </Group>
          </Paper>
          <ReadinessTargetState
            {...readinessState}
            primaryAction={{ label: "Back to readiness", href: "/app/church-admin/readiness" }}
            secondaryAction={{ label: "Compose message", href: "/app/communications" }}
          />
        </Stack>
      ) : null}

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
          <Tabs.Tab value="suppressions" leftSection={<ShieldBan size={14} />}>
            Suppressions
            {suppressions.length > 0 ? (
              <Badge color="grape" size="xs" variant="filled" ml="xs">
                {suppressions.length}
              </Badge>
            ) : null}
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="log" pt="lg">
          {unresolvedDeliveryLogs.length > 0 ? (
            <Alert color="orange" variant="light" radius="md" mb="md">
              <Text fz="sm">
                {unresolvedDeliveryLogs.length} unresolved delivery issue
                {unresolvedDeliveryLogs.length === 1 ? "" : "s"} in the message lane.
                {" "}
                {unresolvedRetryableCount > 0
                  ? `${unresolvedRetryableCount} can be retried now.`
                  : "Retry unavailable for current statuses; review suppression or recipient/contact context."}
              </Text>
            </Alert>
          ) : null}

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
                    <Table.Th>Retry</Table.Th>
                    <Table.Th>Date</Table.Th>
                    <Table.Th>Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {recentLogs.map((log) => {
                    const canRetry = isRetryEligible(log);
                    const retryLabel = `${Math.min(log.retryCount, 3)}/3`;

                    return (
                      <Table.Tr key={log.id}>
                        <Table.Td>
                          <Badge color={CHANNEL_COLORS[log.channel]} size="xs" variant="light" radius="sm">
                            {CHANNEL_LABELS[log.channel]}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Text fz="xs" lineClamp={1}>
                            {log.subject ?? log.bodyPreview ?? "-"}
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
                          <Text fz="xs" c={log.retryCount >= 3 ? "red" : "dimmed"}>
                            {retryLabel}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Text fz="xs" c="dimmed">
                            {log.sentAt
                              ? formatDate(log.sentAt)
                              : log.scheduledFor
                                ? `Scheduled ${formatDate(log.scheduledFor)}`
                                : formatDate(log.createdAt)}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Group gap="xs" wrap="nowrap">
                            <Button
                              size="compact-xs"
                              variant="light"
                              color="blue"
                              onClick={() => handleOpenEvents(log)}
                              leftSection={<Timer size={12} />}
                            >
                              Events
                            </Button>
                            <Button
                              size="compact-xs"
                              variant="light"
                              color="teal"
                              leftSection={<RefreshCcw size={12} />}
                              loading={retryingLogId === log.id}
                              disabled={!canRetry || isPending}
                              onClick={() => handleRetry(log)}
                            >
                              Retry
                            </Button>
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </Paper>
          )}
        </Tabs.Panel>

        <Tabs.Panel value="members" pt="lg">
          <Stack gap="sm">
            {recipients.map((recipient) => (
              <Paper key={recipient.profileId} withBorder p="sm" radius="md">
                <Group justify="space-between">
                  <Stack gap={2}>
                    <Text fz="sm" fw={600}>
                      {recipient.name}
                    </Text>
                    <Text fz="xs" c="dimmed">
                      {recipient.email ?? recipient.phone ?? "No contact info"} · {recipient.role}
                    </Text>
                    {recipient.ministries.length > 0 ? (
                      <Text fz="xs" c="dimmed">
                        {recipient.ministries.join(", ")}
                      </Text>
                    ) : null}
                  </Stack>
                  <Group gap="xs">
                    {recipient.emailOptIn ? (
                      <Badge size="xs" color="blue" variant="light" leftSection={<CheckCircle size={10} />}>
                        Email
                      </Badge>
                    ) : (
                      <Badge size="xs" color="gray" variant="light" leftSection={<XCircle size={10} />}>
                        No email
                      </Badge>
                    )}
                    {recipient.smsOptIn ? (
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

        <Tabs.Panel value="suppressions" pt="lg">
          <Stack gap="md">
            <Group justify="space-between">
              <Text fw={600} size="sm">
                Suppressed Contacts
              </Text>
              <Button
                size="xs"
                radius="xl"
                variant="light"
                color="grape"
                leftSection={<ShieldBan size={12} />}
                onClick={suppression.open}
              >
                Add Suppression
              </Button>
            </Group>

            {suppressions.length === 0 ? (
              <Alert color="grape" variant="light" radius="md">
                <Text fz="sm" c="dimmed">
                  No contacts are suppressed yet.
                </Text>
              </Alert>
            ) : (
              <Paper withBorder radius="md" style={{ overflow: "hidden" }}>
                <Table striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Channel</Table.Th>
                      <Table.Th>Contact</Table.Th>
                      <Table.Th>Reason</Table.Th>
                      <Table.Th>Notes</Table.Th>
                      <Table.Th>By</Table.Th>
                      <Table.Th>Date</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {suppressions.map((suppressionRow) => (
                      <Table.Tr key={suppressionRow.id}>
                        <Table.Td>
                          <Badge size="xs" color={suppressionRow.channel === "email" ? "blue" : "teal"}>
                            {suppressionRow.channel.toUpperCase()}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Text fz="xs">{suppressionRow.contact}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Badge size="xs" variant="dot" color="grape">
                            {suppressionRow.reason}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Text fz="xs" c="dimmed" lineClamp={1}>
                            {suppressionRow.notes ?? "-"}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Text fz="xs" c="dimmed">
                            {suppressionRow.suppressedByName ?? "System"}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Text fz="xs" c="dimmed">
                            {formatDate(suppressionRow.createdAt)}
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Paper>
            )}
          </Stack>
        </Tabs.Panel>
      </Tabs>

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
            onChange={(value) => setChannel((value ?? "email") as "email" | "sms")}
            data={[
              { value: "email", label: "Email" },
              { value: "sms", label: "SMS" },
            ]}
            radius="md"
          />

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
              placeholder="Search members..."
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
                {noContactCount > 0
                  ? `${noContactCount} recipient(s) have no ${channel} address and will be skipped. `
                  : ""}
                {optedOutCount > 0
                  ? `${optedOutCount} recipient(s) have opted out of ${channel} and will be skipped.`
                  : ""}
              </Text>
            </Alert>
          ) : null}

          {channel === "email" ? (
            <TextInput
              label="Subject"
              placeholder="e.g. Sunday Service Reminder"
              value={subject}
              onChange={(event) => setSubject(event.currentTarget.value)}
              radius="md"
            />
          ) : null}

          <Textarea
            label="Message"
            placeholder="Write your message here..."
            value={body}
            onChange={(event) => setBody(event.currentTarget.value)}
            minRows={5}
            autosize
            radius="md"
          />

          <TextInput
            label="Schedule for (optional)"
            type="datetime-local"
            value={scheduledFor}
            onChange={(event) => setScheduledFor(event.currentTarget.value)}
            min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)}
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

      <Drawer
        opened={suppressionOpen}
        onClose={suppression.close}
        title="Add Suppression"
        position="right"
        size="md"
        radius="lg"
      >
        <Stack gap="md" p="md">
          <Select
            label="Channel"
            value={suppressionChannel}
            onChange={(value) => setSuppressionChannel((value ?? "email") as "email" | "sms")}
            data={[
              { value: "email", label: "Email" },
              { value: "sms", label: "SMS" },
            ]}
          />

          <TextInput
            label={suppressionChannel === "email" ? "Email address" : "Phone number"}
            placeholder={suppressionChannel === "email" ? "member@example.com" : "+15555550100"}
            value={suppressionContact}
            onChange={(event) => setSuppressionContact(event.currentTarget.value)}
          />

          <Textarea
            label="Notes (optional)"
            placeholder="Reason for manual suppression"
            value={suppressionNotes}
            onChange={(event) => setSuppressionNotes(event.currentTarget.value)}
            autosize
            minRows={3}
          />

          <Group justify="flex-end">
            <Button variant="default" onClick={suppression.close}>
              Cancel
            </Button>
            <Button color="grape" loading={isPending} onClick={handleAddSuppression}>
              Save suppression
            </Button>
          </Group>
        </Stack>
      </Drawer>

      <Drawer
        opened={eventsOpen}
        onClose={events.close}
        title={activeLog ? `Delivery events: ${activeLog.subject ?? activeLog.id}` : "Delivery events"}
        position="right"
        size="lg"
        radius="lg"
      >
        <Stack gap="md" p="md">
          {isLoadingEvents ? (
            <Alert color="blue" variant="light">
              <Text fz="sm">Loading delivery events...</Text>
            </Alert>
          ) : activeEvents.length === 0 ? (
            <Alert color="gray" variant="light">
              <Text fz="sm">No delivery events found for this log yet.</Text>
            </Alert>
          ) : (
            <Paper withBorder radius="md" style={{ overflow: "hidden" }}>
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>When</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Provider</Table.Th>
                    <Table.Th>Type</Table.Th>
                    <Table.Th>Reason</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {activeEvents.map((event) => (
                    <Table.Tr key={event.id}>
                      <Table.Td>
                        <Text fz="xs" c="dimmed">
                          {formatDate(event.occurredAt)}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge size="xs" color={STATUS_COLORS[event.status]} variant="dot">
                          {event.status}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Text fz="xs">{event.provider}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text fz="xs">{event.eventType}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text fz="xs" c="dimmed" lineClamp={1}>
                          {event.reason ?? "-"}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Paper>
          )}
        </Stack>
      </Drawer>
    </ApplicationShell>
  );
}
