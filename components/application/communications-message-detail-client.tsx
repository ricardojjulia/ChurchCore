"use client";

import Link from "next/link";
import {
  Badge,
  Button,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { ArrowLeft, Mail } from "lucide-react";

import { ApplicationShell } from "@/components/application/app-shell";
import type { ChurchAppSession } from "@/lib/auth";
import type { MessageAnalytics, CommunicationLogSummary } from "@/lib/communications-types";

const navItems = [
  {
    href: "/app/communications/history",
    label: "Message History",
    description: "All sent and scheduled messages",
    icon: Mail,
    active: true,
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

const ROLE_LABELS: Record<string, string> = {
  church_admin: "Church Admin",
  "church-admin": "Church Admin",
  secretary: "Secretary",
  pastor: "Pastor",
  ministry_leader: "Ministry Leader",
  member_volunteer: "Member / Volunteer",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  inactive: "Inactive",
  visitor: "Visitor",
  baptized: "Baptized",
  transferred: "Transferred",
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

function formatPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

export function CommunicationsMessageDetailClient({
  session,
  log,
  analytics,
}: {
  session: ChurchAppSession;
  log: CommunicationLogSummary;
  analytics: MessageAnalytics;
}) {
  const criteria = log.segmentCriteria;

  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/communications/history"
      calendarHref="/app/calendar"
      sectionLabel="Communications"
      title="Message Detail"
      description={session.appContext.church.name}
      sidebarTitle="Communications"
      sidebarDescription="Send and manage messages"
      navLabel="Communications"
      navItems={navItems}
    >
      <Stack gap="lg">
        <Group>
          <Button
            component={Link}
            href="/app/communications/history"
            variant="subtle"
            size="xs"
            radius="xl"
            leftSection={<ArrowLeft size={14} />}
          >
            Back to History
          </Button>
        </Group>

        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
          {/* Metadata */}
          <Paper withBorder p="xl" radius="lg">
            <Stack gap="md">
              <Title order={3} fw={700} c="#101827">
                {log.subject ?? "SMS Message"}
              </Title>

              <Group gap="xs">
                <Badge
                  color={CHANNEL_COLORS[log.channel] ?? "gray"}
                  variant="filled"
                  size="sm"
                >
                  {log.channel.toUpperCase()}
                </Badge>
                <Badge
                  color={STATUS_COLORS[log.status] ?? "gray"}
                  variant="dot"
                  size="sm"
                >
                  {log.status}
                </Badge>
              </Group>

              <Stack gap={4}>
                <Group gap="xs">
                  <Text size="xs" c="dimmed" fw={600}>
                    Sent by:
                  </Text>
                  <Text size="xs">{log.sentByName ?? "—"}</Text>
                </Group>
                <Group gap="xs">
                  <Text size="xs" c="dimmed" fw={600}>
                    Date:
                  </Text>
                  <Text size="xs">
                    {log.sentAt
                      ? formatDate(log.sentAt)
                      : log.scheduledFor
                        ? `Scheduled: ${formatDate(log.scheduledFor)}`
                        : formatDate(log.createdAt)}
                  </Text>
                </Group>
              </Stack>

              <div>
                <Text size="xs" fw={600} c="dimmed" mb={6}>
                  Audience segment
                </Text>
                {!criteria ||
                (!criteria.role &&
                  (!criteria.ministryIds || criteria.ministryIds.length === 0) &&
                  !criteria.membershipStatus &&
                  !criteria.attendedWithinDays) ? (
                  <Badge variant="outline" size="sm">
                    All eligible members
                  </Badge>
                ) : (
                  <Group gap="xs">
                    {criteria.role ? (
                      <Badge variant="outline" size="sm">
                        Role: {ROLE_LABELS[criteria.role] ?? criteria.role}
                      </Badge>
                    ) : null}
                    {criteria.ministryIds && criteria.ministryIds.length > 0 ? (
                      <Badge variant="outline" size="sm">
                        Ministry: {criteria.ministryIds.length} selected
                      </Badge>
                    ) : null}
                    {criteria.membershipStatus ? (
                      <Badge variant="outline" size="sm">
                        Status: {STATUS_LABELS[criteria.membershipStatus] ?? criteria.membershipStatus}
                      </Badge>
                    ) : null}
                    {criteria.attendedWithinDays ? (
                      <Badge variant="outline" size="sm">
                        Attended within: {criteria.attendedWithinDays} days
                      </Badge>
                    ) : null}
                  </Group>
                )}
              </div>
            </Stack>
          </Paper>

          {/* Analytics */}
          <Paper withBorder p="xl" radius="lg">
            <Stack gap="md">
              <Title order={3} fw={700} c="#101827">
                Delivery Analytics
              </Title>

              <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="sm">
                <Paper withBorder p="md" radius="md">
                  <Text size="xs" c="dimmed" fw={600}>
                    Sent
                  </Text>
                  <Text size="xl" fw={700} c="#101827">
                    {analytics.sentCount}
                  </Text>
                </Paper>

                <Paper withBorder p="md" radius="md">
                  <Text size="xs" c="dimmed" fw={600}>
                    Delivered
                  </Text>
                  <Text size="xl" fw={700} c="green">
                    {analytics.deliveredCount}
                  </Text>
                </Paper>

                <Paper withBorder p="md" radius="md">
                  <Text size="xs" c="dimmed" fw={600}>
                    Bounced / Failed
                  </Text>
                  <Text
                    size="xl"
                    fw={700}
                    c={analytics.bouncedCount + analytics.failedCount > 0 ? "red" : "#101827"}
                  >
                    {analytics.bouncedCount + analytics.failedCount}
                  </Text>
                </Paper>

                <Paper withBorder p="md" radius="md">
                  <Text size="xs" c="dimmed" fw={600}>
                    Open Rate
                  </Text>
                  <Text size="xl" fw={700} c="#101827">
                    {log.channel === "email" && analytics.openRate !== null
                      ? formatPercent(analytics.openRate)
                      : "N/A"}
                  </Text>
                </Paper>

                <Paper withBorder p="md" radius="md">
                  <Text size="xs" c="dimmed" fw={600}>
                    Suppressed
                  </Text>
                  <Text size="xl" fw={700} c="#101827">
                    {analytics.suppressedCount}
                  </Text>
                </Paper>
              </SimpleGrid>

              <Text size="xs" c="dimmed">
                Individual recipient data is not tracked.
              </Text>
            </Stack>
          </Paper>
        </SimpleGrid>
      </Stack>
    </ApplicationShell>
  );
}
