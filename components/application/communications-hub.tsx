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
  SimpleGrid,
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
  retryAllEligibleAction,
  retryCommunicationAction,
  suppressContactAction,
} from "@/app/app/communications-actions";
import { ApplicationShell } from "@/components/application/app-shell";
import { ReadinessTargetState } from "@/components/application/readiness-target-state";
import { useI18n } from "@/components/i18n-provider";
import type { ChurchAppSession } from "@/lib/auth";
import { buildCommunicationsClosureGuidance } from "@/lib/communications-closure-guidance";
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
  const { t } = useI18n();
  const { recentLogs, recipients, suppressions } = data;

  const [isPending, startTransition] = useTransition();

  // Build channel labels inside component so t() is available
  const CHANNEL_LABELS: Record<CommunicationLogEntry["channel"], string> = {
    email: t("communicationsHub", "channelEmail"),
    sms: t("communicationsHub", "channelSms"),
    push: t("communicationsHub", "channelPush"),
    in_app: t("communicationsHub", "channelInApp"),
  };

  // Build status label map inside component
  const statusLabel: Record<string, string> = {
    queued: t("communicationsHub", "statusQueued"),
    scheduled: t("communicationsHub", "statusScheduled"),
    sent: t("communicationsHub", "statusSent"),
    delivered: t("communicationsHub", "statusDelivered"),
    failed: t("communicationsHub", "statusFailed"),
    bounced: t("communicationsHub", "statusBounced"),
    suppressed: t("communicationsHub", "statusSuppressed"),
    unsubscribed: t("communicationsHub", "statusUnsubscribed"),
    cancelled: t("communicationsHub", "statusCancelled"),
  };

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
      label: t("communicationsHub", "navHome"),
      description: t("communicationsHub", "navHomeDesc"),
      icon: Mail,
    },
    {
      href: "/app/communications",
      label: t("communicationsHub", "navCommunications"),
      description: t("communicationsHub", "navCommunicationsDesc"),
      icon: Send,
      active: true,
    },
    {
      href: "/app/reports",
      label: t("communicationsHub", "navReports"),
      description: t("communicationsHub", "navReportsDesc"),
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
        label: `${recipient.name} (${recipient.email ?? recipient.phone ?? t("communicationsHub", "noContactInfo")})`,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    (recipient) => !recipient.emailOptIn || !recipient.smsOptIn,
  ).length;
  const closureGuidance = buildCommunicationsClosureGuidance({ recentLogs, recipients, suppressions });

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
        title: t("communicationsHub", "missingSubjectTitle"),
        message: t("communicationsHub", "missingSubjectBody"),
        color: "yellow",
      });
      return;
    }

    if (scheduledFor) {
      const parsed = new Date(scheduledFor);
      if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) {
        notifications.show({
          title: t("communicationsHub", "invalidScheduleTitle"),
          message: t("communicationsHub", "invalidScheduleBody"),
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
          title: t("communicationsHub", "messageDispatchedTitle"),
          message: t("communicationsHub", "sendSummary", { sent: result.sent, skipped: result.skipped, errors: result.errors }),
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
          title: t("communicationsHub", "errorTitle"),
          message: error instanceof Error ? error.message : t("communicationsHub", "errorBody"),
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
            title: t("communicationsHub", "retrySkippedTitle"),
            message: result.reason ?? t("communicationsHub", "retrySkippedBody"),
            color: "yellow",
          });
        } else {
          notifications.show({
            title: t("communicationsHub", "retryQueuedTitle"),
            message: t("communicationsHub", "retryQueuedBody"),
            color: "teal",
          });
        }

        router.refresh();
      } catch (error) {
        notifications.show({
          title: t("communicationsHub", "retryFailedTitle"),
          message: error instanceof Error ? error.message : t("communicationsHub", "retryFailedBody"),
          color: "red",
        });
      } finally {
        setRetryingLogId(null);
      }
    });
  }

  function handleRetryAllEligible() {
    startTransition(async () => {
      try {
        const result = await retryAllEligibleAction();
        notifications.show({
          title: t("communicationsHub", "retryQueuedTitle"),
          message: t("communicationsHub", "sendSummary", { sent: result.succeeded, skipped: result.skipped, errors: result.failedAgain }),
          color: result.failedAgain > 0 ? "orange" : "teal",
        });
        router.refresh();
      } catch (error) {
        notifications.show({
          title: t("communicationsHub", "retryFailedTitle"),
          message: error instanceof Error ? error.message : t("communicationsHub", "retryFailedBody"),
          color: "red",
        });
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
          title: t("communicationsHub", "unableToLoadEventsTitle"),
          message: error instanceof Error ? error.message : t("communicationsHub", "unableToLoadEventsBody"),
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
        title: t("communicationsHub", "missingContactTitle"),
        message: t("communicationsHub", "missingContactBody"),
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
          title: t("communicationsHub", "suppressionSavedTitle"),
          message: t("communicationsHub", "suppressionSuccessBody", { channel: suppressionChannel.toUpperCase() }),
          color: "teal",
        });

        setSuppressionContact("");
        setSuppressionNotes("");
        suppression.close();
        router.refresh();
      } catch (error) {
        notifications.show({
          title: t("communicationsHub", "suppressionFailedTitle"),
          message: error instanceof Error ? error.message : t("communicationsHub", "suppressionFailedBody"),
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
      sectionLabel={t("communicationsHub", "sectionLabel")}
      title={t("communicationsHub", "pageTitle")}
      description={session.appContext.church.name}
      sidebarTitle={t("communicationsHub", "sidebarTitle")}
      sidebarDescription={t("communicationsHub", "sidebarDescription")}
      navLabel={t("communicationsHub", "navLabelLeadership")}
      navItems={navItems}
      topActions={
        <Group gap="xs" wrap="nowrap">
          {session.appContext.roleId === "pastor" || session.appContext.roleId === "church-admin" ? (
            <Button
              size="xs"
              variant="light"
              color="orange"
              radius="xl"
              leftSection={<RefreshCcw size={12} />}
              loading={isPending}
              onClick={handleRetryAllEligible}
            >
              {t("communicationsHub", "retryAllEligible")}
            </Button>
          ) : null}
          <Button
            size="xs"
            variant="filled"
            color="blue"
            radius="xl"
            leftSection={<Send size={12} />}
            onClick={compose.open}
          >
            {t("communicationsHub", "compose")}
          </Button>
        </Group>
      }
    >
      {/* Quick links to the new send lifecycle routes */}
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md" mb="lg">
        <Paper
          component="a"
          href="/app/communications/compose"
          withBorder
          radius="lg"
          p="lg"
          style={{ cursor: "pointer", textDecoration: "none" }}
        >
          <Group gap="sm">
            <Send size={18} />
            <div>
              <Text fw={700} size="sm">New Message</Text>
              <Text size="xs" c="dimmed">Compose and send to a segment</Text>
            </div>
          </Group>
        </Paper>
        <Paper
          component="a"
          href="/app/communications/history"
          withBorder
          radius="lg"
          p="lg"
          style={{ cursor: "pointer", textDecoration: "none" }}
        >
          <Group gap="sm">
            <Mail size={18} />
            <div>
              <Text fw={700} size="sm">Message History</Text>
              <Text size="xs" c="dimmed">View sent and scheduled messages</Text>
            </div>
          </Group>
        </Paper>
      </SimpleGrid>

      {readinessView ? (
        <Stack gap="md" mb="lg">
          <Paper withBorder radius="lg" p="md" bg="#f8fbff">
            <Group justify="space-between" gap="md" align="flex-start">
              <div>
                <Text fw={700} size="sm">
                  {t("communicationsHub", "readinessView")}
                </Text>
                <Text size="sm" c="dimmed" mt={4}>
                  {readinessIssueCount > 0
                    ? `${readinessIssueCount} item${readinessIssueCount === 1 ? "" : "s"} need review across sends, bounces, suppressions, contacts, and consent.`
                    : "Queued sends, failed delivery, bounces, suppressions, contact gaps, and consent gaps are clear."}
                </Text>
              </div>
              <Text component="a" href="/app/church-admin/readiness" size="sm" fw={700} c="churchBlue">
                {t("communicationsHub", "backToReadiness")}
              </Text>
            </Group>
          </Paper>
          <ReadinessTargetState
            {...readinessState}
            primaryAction={{ label: t("communicationsHub", "backToReadiness"), href: "/app/church-admin/readiness" }}
            secondaryAction={{ label: t("communicationsHub", "composeMessage"), href: "/app/communications" }}
          />

          <Paper withBorder radius="lg" p="md">
            <Group justify="space-between" align="flex-start" gap="md">
              <div>
                <Text fw={700} size="sm">
                  {t("communicationsHub", "unresolvedLaneClosure")}
                </Text>
                <Text size="sm" c="dimmed" mt={4}>
                  {closureGuidance.expectedResolvedState}
                </Text>
              </div>
              <Badge color={closureGuidance.resolved ? "green" : "orange"} variant="light">
                {closureGuidance.resolved
                  ? t("communicationsHub", "resolved")
                  : t("communicationsHub", "nOpen", { count: closureGuidance.unresolvedCount })}
              </Badge>
            </Group>

            <Stack gap="sm" mt="md">
              {closureGuidance.steps.length > 0 ? (
                closureGuidance.steps.map((step) => (
                  <Paper key={step.title} withBorder radius="md" p="sm">
                    <Group justify="space-between" align="flex-start" gap="md">
                      <div>
                        <Text fw={600} size="sm">
                          {step.title}
                        </Text>
                        <Text size="sm" c="dimmed" mt={4}>
                          {step.detail}
                        </Text>
                      </div>
                      <Button component="a" href={step.href} size="xs" variant="light">
                        {step.actionLabel}
                      </Button>
                    </Group>
                  </Paper>
                ))
              ) : (
                <Text size="sm" c="dimmed">
                  {closureGuidance.resolvedSummary}
                </Text>
              )}
            </Stack>
          </Paper>
        </Stack>
      ) : null}

      <Tabs defaultValue="log" radius="xl">
        <Tabs.List>
          <Tabs.Tab value="log" leftSection={<Mail size={14} />}>
            {t("communicationsHub", "tabLog")}
            {recentLogs.length > 0 ? (
              <Badge color="blue" size="xs" variant="filled" ml="xs">
                {recentLogs.length}
              </Badge>
            ) : null}
          </Tabs.Tab>
          <Tabs.Tab value="members" leftSection={<MessageSquare size={14} />}>
            {t("communicationsHub", "tabMembers")}
          </Tabs.Tab>
          <Tabs.Tab value="suppressions" leftSection={<ShieldBan size={14} />}>
            {t("communicationsHub", "tabSuppressions")}
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
                {unresolvedDeliveryLogs.length === 1
                  ? t("communicationsHub", "unresolvedIssuesSingular", { count: unresolvedDeliveryLogs.length })
                  : t("communicationsHub", "unresolvedIssuesPlural", { count: unresolvedDeliveryLogs.length })}
                {" "}
                {unresolvedRetryableCount > 0
                  ? t("communicationsHub", "canBeRetriedNow", { count: unresolvedRetryableCount })
                  : t("communicationsHub", "retryUnavailable")}
              </Text>
            </Alert>
          ) : null}

          {recentLogs.length === 0 ? (
            <Alert color="blue" variant="light" radius="md">
              <Text fz="sm" c="dimmed" ta="center" py="sm">
                {t("communicationsHub", "noMessagesSentYet")}
              </Text>
            </Alert>
          ) : (
            <Paper withBorder radius="md" style={{ overflow: "hidden" }}>
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t("communicationsHub", "thChannel")}</Table.Th>
                    <Table.Th>{t("communicationsHub", "thMessage")}</Table.Th>
                    <Table.Th>{t("communicationsHub", "thRecipient")}</Table.Th>
                    <Table.Th>{t("communicationsHub", "thStatus")}</Table.Th>
                    <Table.Th>{t("communicationsHub", "thRetry")}</Table.Th>
                    <Table.Th>{t("communicationsHub", "thDate")}</Table.Th>
                    <Table.Th>{t("communicationsHub", "thActions")}</Table.Th>
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
                            {statusLabel[log.status] ?? log.status}
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
                                ? `${t("communicationsHub", "scheduledPrefix")} ${formatDate(log.scheduledFor)}`
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
                      {recipient.email ?? recipient.phone ?? t("communicationsHub", "noContactInfo")} · {recipient.role}
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
                        {t("communicationsHub", "badgeEmail")}
                      </Badge>
                    ) : (
                      <Badge size="xs" color="gray" variant="light" leftSection={<XCircle size={10} />}>
                        {t("communicationsHub", "badgeNoEmail")}
                      </Badge>
                    )}
                    {recipient.smsOptIn ? (
                      <Badge size="xs" color="teal" variant="light" leftSection={<CheckCircle size={10} />}>
                        {t("communicationsHub", "badgeSms")}
                      </Badge>
                    ) : (
                      <Badge size="xs" color="gray" variant="light" leftSection={<XCircle size={10} />}>
                        {t("communicationsHub", "badgeNoSms")}
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
                {t("communicationsHub", "suppressedContacts")}
              </Text>
              <Button
                size="xs"
                radius="xl"
                variant="light"
                color="grape"
                leftSection={<ShieldBan size={12} />}
                onClick={suppression.open}
              >
                {t("communicationsHub", "addSuppression")}
              </Button>
            </Group>

            {suppressions.length === 0 ? (
              <Alert color="grape" variant="light" radius="md">
                <Text fz="sm" c="dimmed">
                  {t("communicationsHub", "noContactsSuppressed")}
                </Text>
              </Alert>
            ) : (
              <Paper withBorder radius="md" style={{ overflow: "hidden" }}>
                <Table striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{t("communicationsHub", "thChannel")}</Table.Th>
                      <Table.Th>{t("communicationsHub", "thContact")}</Table.Th>
                      <Table.Th>{t("communicationsHub", "thReason")}</Table.Th>
                      <Table.Th>{t("communicationsHub", "thNotes")}</Table.Th>
                      <Table.Th>{t("communicationsHub", "thBy")}</Table.Th>
                      <Table.Th>{t("communicationsHub", "thDate")}</Table.Th>
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
        title={t("communicationsHub", "composeMessageTitle")}
        position="right"
        size="lg"
        radius="lg"
      >
        <Stack gap="md" p="md">
          <Select
            label={t("communicationsHub", "channel")}
            value={channel}
            onChange={(value) => setChannel((value ?? "email") as "email" | "sms")}
            data={[
              { value: "email", label: t("communicationsHub", "channelEmail") },
              { value: "sms", label: t("communicationsHub", "channelSms") },
            ]}
            radius="md"
          />

          <Select
            label={t("communicationsHub", "filterByRole")}
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
              label={t("communicationsHub", "recipients")}
              placeholder={t("communicationsHub", "searchMembers")}
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
              {t("communicationsHub", "selectAll", { count: filteredRecipients.length })}
            </Button>
            {selectedIds.length > 0 ? (
              <Button size="xs" variant="subtle" color="gray" radius="xl" onClick={handleClearSelection}>
                {t("communicationsHub", "clear")}
              </Button>
            ) : null}
          </Group>

          {selectedIds.length > 0 && (noContactCount > 0 || optedOutCount > 0) ? (
            <Alert color="orange" variant="light" radius="md">
              <Text fz="xs">
                {noContactCount > 0
                  ? t("communicationsHub", "noContactCount", { count: noContactCount, channel }) + " "
                  : ""}
                {optedOutCount > 0
                  ? t("communicationsHub", "optedOutCount", { count: optedOutCount, channel })
                  : ""}
              </Text>
            </Alert>
          ) : null}

          {channel === "email" ? (
            <TextInput
              label={t("communicationsHub", "subject")}
              placeholder={t("communicationsHub", "subjectPlaceholder")}
              value={subject}
              onChange={(event) => setSubject(event.currentTarget.value)}
              radius="md"
            />
          ) : null}

          <Textarea
            label={t("communicationsHub", "message")}
            placeholder={t("communicationsHub", "messagePlaceholder")}
            value={body}
            onChange={(event) => setBody(event.currentTarget.value)}
            minRows={5}
            autosize
            radius="md"
          />

          <TextInput
            label={t("communicationsHub", "scheduledFor")}
            type="datetime-local"
            value={scheduledFor}
            onChange={(event) => setScheduledFor(event.currentTarget.value)}
            min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)}
            radius="md"
          />

          <Divider />
          <Group justify="flex-end" gap="sm">
            <Button variant="default" radius="xl" onClick={compose.close}>
              {t("communicationsHub", "cancel")}
            </Button>
            <Button
              color="blue"
              radius="xl"
              loading={isPending}
              disabled={!body.trim() || selectedIds.length === 0}
              leftSection={<Send size={12} />}
              onClick={handleSend}
            >
              {selectedIds.length === 1
                ? t("communicationsHub", "sendToSingular", { count: selectedIds.length })
                : t("communicationsHub", "sendToPlural", { count: selectedIds.length })}
            </Button>
          </Group>
        </Stack>
      </Drawer>

      <Drawer
        opened={suppressionOpen}
        onClose={suppression.close}
        title={t("communicationsHub", "addSuppression")}
        position="right"
        size="md"
        radius="lg"
      >
        <Stack gap="md" p="md">
          <Select
            label={t("communicationsHub", "channel")}
            value={suppressionChannel}
            onChange={(value) => setSuppressionChannel((value ?? "email") as "email" | "sms")}
            data={[
              { value: "email", label: t("communicationsHub", "channelEmail") },
              { value: "sms", label: t("communicationsHub", "channelSms") },
            ]}
          />

          <TextInput
            label={suppressionChannel === "email"
              ? t("communicationsHub", "emailAddress")
              : t("communicationsHub", "phoneNumber")}
            placeholder={suppressionChannel === "email" ? "member@example.com" : "+15555550100"}
            value={suppressionContact}
            onChange={(event) => setSuppressionContact(event.currentTarget.value)}
          />

          <Textarea
            label={t("communicationsHub", "reasonLabel")}
            placeholder="Reason for manual suppression"
            value={suppressionNotes}
            onChange={(event) => setSuppressionNotes(event.currentTarget.value)}
            autosize
            minRows={3}
          />

          <Group justify="flex-end">
            <Button variant="default" onClick={suppression.close}>
              {t("communicationsHub", "cancel")}
            </Button>
            <Button color="grape" loading={isPending} onClick={handleAddSuppression}>
              {t("communicationsHub", "saveSuppression")}
            </Button>
          </Group>
        </Stack>
      </Drawer>

      <Drawer
        opened={eventsOpen}
        onClose={events.close}
        title={activeLog
          ? `${t("communicationsHub", "deliveryEventsPrefix")} ${activeLog.subject ?? activeLog.id}`
          : t("communicationsHub", "deliveryEventsPrefix")}
        position="right"
        size="lg"
        radius="lg"
      >
        <Stack gap="md" p="md">
          {isLoadingEvents ? (
            <Alert color="blue" variant="light">
              <Text fz="sm">{t("communicationsHub", "loadingDeliveryEvents")}</Text>
            </Alert>
          ) : activeEvents.length === 0 ? (
            <Alert color="gray" variant="light">
              <Text fz="sm">{t("communicationsHub", "noDeliveryEventsFound")}</Text>
            </Alert>
          ) : (
            <Paper withBorder radius="md" style={{ overflow: "hidden" }}>
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t("communicationsHub", "thWhen")}</Table.Th>
                    <Table.Th>{t("communicationsHub", "thStatus")}</Table.Th>
                    <Table.Th>{t("communicationsHub", "thProvider")}</Table.Th>
                    <Table.Th>{t("communicationsHub", "thType")}</Table.Th>
                    <Table.Th>{t("communicationsHub", "thReason")}</Table.Th>
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
                          {statusLabel[event.status] ?? event.status}
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
