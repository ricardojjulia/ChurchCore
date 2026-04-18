"use client";

import {
  Badge,
  Group,
  Paper,
  RingProgress,
  Stack,
  Table,
  Tabs,
  Text,
} from "@mantine/core";
import { BarChart2, DollarSign, RefreshCw, TrendingUp } from "lucide-react";

import { ApplicationShell } from "@/components/application/app-shell";
import type { ChurchAppSession } from "@/lib/auth";
import type { GivingAnalyticsData, GivingDashboardData, DonationEntry } from "@/lib/donations-data";
import { GivingAnalyticsPanel } from "@/components/application/giving-analytics";

function formatCents(cents: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

const STATUS_COLORS: Record<DonationEntry["status"], string> = {
  pending: "yellow",
  succeeded: "green",
  failed: "red",
  refunded: "orange",
  cancelled: "gray",
};

export function GivingDashboard({
  session,
  data,
  analytics,
}: {
  session: ChurchAppSession;
  data: GivingDashboardData;
  analytics?: GivingAnalyticsData;
}) {
  const { recentDonations, reportByFund, totalThisMonth, totalAllTime, recurringCount } = data;

  const navItems = [
    {
      href: "/app/pastor",
      label: "Home",
      description: "Overview",
      icon: DollarSign,
    },
    {
      href: "/app/giving",
      label: "Giving",
      description: "Donation reports",
      icon: BarChart2,
      active: true,
    },
    {
      href: "/app/reports/giving",
      label: "Reports",
      description: "Reporting suite",
      icon: TrendingUp,
    },
  ];

  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/pastor"
      calendarHref="/app/calendar"
      sectionLabel="Leadership"
      title="Giving Overview"
      description={session.appContext.church.name}
      sidebarTitle="Giving Dashboard"
      sidebarDescription="Voluntary giving summaries and fund trends. All donor data is handled with care."
      navLabel="Leadership"
      navItems={navItems}
    >
      {/* Summary cards */}
      <Group grow mb="lg" align="stretch">
        <Paper withBorder p="md" radius="md">
          <Text fz="xs" c="dimmed">
            This month
          </Text>
          <Text fz="xl" fw={700}>
            {formatCents(totalThisMonth)}
          </Text>
        </Paper>
        <Paper withBorder p="md" radius="md">
          <Text fz="xs" c="dimmed">
            All time
          </Text>
          <Text fz="xl" fw={700}>
            {formatCents(totalAllTime)}
          </Text>
        </Paper>
        <Paper withBorder p="md" radius="md">
          <Group gap="sm" align="center">
            <RefreshCw size={16} color="var(--mantine-color-blue-6)" />
            <Stack gap={0}>
              <Text fz="xs" c="dimmed">
                Active recurring
              </Text>
              <Text fz="xl" fw={700}>
                {recurringCount}
              </Text>
            </Stack>
          </Group>
        </Paper>
      </Group>

      <Tabs defaultValue="recent" radius="xl">
        <Tabs.List>
          <Tabs.Tab value="recent" leftSection={<DollarSign size={14} />}>
            Recent Gifts
          </Tabs.Tab>
          <Tabs.Tab value="funds" leftSection={<BarChart2 size={14} />}>
            By Fund
          </Tabs.Tab>
          {analytics && (
            <Tabs.Tab value="analytics" leftSection={<TrendingUp size={14} />}>
              Analytics
            </Tabs.Tab>
          )}
        </Tabs.List>

        {/* Recent donations */}
        <Tabs.Panel value="recent" pt="lg">
          <Paper withBorder radius="md" style={{ overflow: "hidden" }}>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Date</Table.Th>
                  <Table.Th>Amount</Table.Th>
                  <Table.Th>Fund</Table.Th>
                  <Table.Th>Donor</Table.Th>
                  <Table.Th>Type</Table.Th>
                  <Table.Th>Status</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {recentDonations.length === 0 ? (
                  <Table.Tr>
                    <Table.Td colSpan={6}>
                      <Text fz="sm" c="dimmed" ta="center" py="sm">
                        No donations recorded yet.
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ) : (
                  recentDonations.map((d) => (
                    <Table.Tr key={d.id}>
                      <Table.Td>
                        <Text fz="xs">{formatDate(d.createdAt)}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text fz="xs" fw={600}>
                          {formatCents(d.amountCents, d.currency)}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text fz="xs">{d.fundDesignation ?? "General"}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text fz="xs" c="dimmed">
                          {d.isAnonymous
                            ? "Anonymous"
                            : (d.donorName ?? "Member")}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        {d.isRecurring ? (
                          <Badge size="xs" color="blue" variant="light">
                            Recurring
                          </Badge>
                        ) : (
                          <Badge size="xs" color="gray" variant="light">
                            One-time
                          </Badge>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Badge
                          size="xs"
                          color={STATUS_COLORS[d.status]}
                          variant="dot"
                        >
                          {d.status}
                        </Badge>
                      </Table.Td>
                    </Table.Tr>
                  ))
                )}
              </Table.Tbody>
            </Table>
          </Paper>
        </Tabs.Panel>

        {/* By fund */}
        <Tabs.Panel value="funds" pt="lg">
          {reportByFund.length === 0 ? (
            <Text fz="sm" c="dimmed" ta="center" py="lg">
              No fund data yet.
            </Text>
          ) : (
            <Stack gap="sm">
              {reportByFund.map((row) => {
                const pct =
                  totalAllTime > 0
                    ? Math.round((row.totalCents / totalAllTime) * 100)
                    : 0;
                return (
                  <Paper
                    key={row.fundDesignation ?? "general"}
                    withBorder
                    p="md"
                    radius="md"
                  >
                    <Group justify="space-between" align="center">
                      <Group gap="md" align="center">
                        <RingProgress
                          size={48}
                          thickness={5}
                          sections={[{ value: pct, color: "teal" }]}
                          label={
                            <Text fz={9} ta="center" fw={700}>
                              {pct}%
                            </Text>
                          }
                        />
                        <Stack gap={2}>
                          <Text fz="sm" fw={600}>
                            {row.fundDesignation ?? "General Fund"}
                          </Text>
                          <Text fz="xs" c="dimmed">
                            {row.count} gift{row.count !== 1 ? "s" : ""} ·{" "}
                            {row.recurringCount} recurring
                          </Text>
                        </Stack>
                      </Group>
                      <Text fw={700}>{formatCents(row.totalCents)}</Text>
                    </Group>
                  </Paper>
                );
              })}
            </Stack>
          )}
        </Tabs.Panel>
      </Tabs>

      {/* Analytics tab */}
      {analytics && (
        <Tabs.Panel value="analytics" pt="lg">
          <GivingAnalyticsPanel analytics={analytics} />
        </Tabs.Panel>
      )}

      {/* Privacy note */}
      <Text fz="xs" c="dimmed" ta="center" mt="xl">
        Anonymous donations are shown without donor identity. All giving is voluntary and 100% church-controlled — ChurchForge takes no platform fees.
      </Text>
    </ApplicationShell>
  );
}
