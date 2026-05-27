"use client";

import Link from "next/link";
import {
  Badge,
  Group,
  Paper,
  Progress,
  SimpleGrid,
  Stack,
  Table,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
import {
  AlertTriangle,
  ArrowRight,
  BarChart2,
  CalendarRange,
  Coins,
  UsersRound,
} from "lucide-react";

import { ReadinessTargetState } from "@/components/application/readiness-target-state";
import type { ReadinessSummary } from "@/lib/readiness-contract";
import type {
  EventReportsData,
  FundBreakdownRow,
  GivingReportsData,
  MemberReportsData,
  ReportAlertRow,
  ReportBreakdownRow,
  ReportTrendPoint,
} from "@/lib/reports-data";

function formatInteger(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function maxValue(values: number[]) {
  return Math.max(...values, 1);
}

function MetricCard({
  label,
  value,
  detail,
  tone = "churchBlue",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: string;
}) {
  return (
    <Paper withBorder radius="xl" p="lg" bg="#fbfcfe">
      <Stack gap={8}>
        <Text size="xs" fw={700} tt="uppercase" c="dimmed">
          {label}
        </Text>
        <Text size="2rem" fw={800} lh={1}>
          {value}
        </Text>
        <Progress value={100} color={tone} size="xs" radius="xl" />
        <Text size="sm" c="dimmed">
          {detail}
        </Text>
      </Stack>
    </Paper>
  );
}

function TrendCard({
  title,
  subtitle,
  points,
  tone = "churchBlue",
  formatter = formatInteger,
}: {
  title: string;
  subtitle: string;
  points: ReportTrendPoint[];
  tone?: string;
  formatter?: (value: number) => string;
}) {
  const highest = maxValue(points.map((point) => point.value));

  return (
    <Paper withBorder radius="xl" p="xl">
      <Stack gap="lg">
        <div>
          <Title order={3} size="h4">
            {title}
          </Title>
          <Text size="sm" c="dimmed">
            {subtitle}
          </Text>
        </div>

        <Group align="flex-end" gap="xs" wrap="nowrap">
          {points.map((point) => (
            <Stack key={point.label} gap={6} align="center" style={{ flex: 1 }}>
              <Text size="xs" fw={700}>
                {formatter(point.value)}
              </Text>
              <div
                style={{
                  width: "100%",
                  height: 148,
                  display: "flex",
                  alignItems: "flex-end",
                }}
              >
                <div
                  style={{
                    width: "100%",
                    height: `${Math.max((point.value / highest) * 100, point.value > 0 ? 10 : 4)}%`,
                    borderRadius: 18,
                    background:
                      tone === "teal"
                        ? "linear-gradient(180deg, rgba(20,184,166,0.95), rgba(13,148,136,0.65))"
                        : tone === "grape"
                          ? "linear-gradient(180deg, rgba(168,85,247,0.95), rgba(126,34,206,0.65))"
                          : "linear-gradient(180deg, rgba(37,99,235,0.95), rgba(29,78,216,0.65))",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.28)",
                  }}
                />
              </div>
              <Text size="xs" c="dimmed" ta="center">
                {point.label}
              </Text>
            </Stack>
          ))}
        </Group>
      </Stack>
    </Paper>
  );
}

function BreakdownCard({
  title,
  subtitle,
  rows,
  totalOverride,
  valueFormatter = formatInteger,
}: {
  title: string;
  subtitle: string;
  rows: ReportBreakdownRow[];
  totalOverride?: number;
  valueFormatter?: (value: number) => string;
}) {
  const total = totalOverride ?? rows.reduce((sum, row) => sum + row.value, 0);

  return (
    <Paper withBorder radius="xl" p="xl">
      <Stack gap="lg">
        <div>
          <Title order={3} size="h4">
            {title}
          </Title>
          <Text size="sm" c="dimmed">
            {subtitle}
          </Text>
        </div>

        <Stack gap="md">
          {rows.map((row) => (
            <Stack key={row.label} gap={6}>
              <Group justify="space-between" align="flex-end">
                <div>
                  <Text fw={600} size="sm">
                    {row.label}
                  </Text>
                  {row.detail ? (
                    <Text size="xs" c="dimmed">
                      {row.detail}
                    </Text>
                  ) : null}
                </div>
                <Text size="sm" fw={700}>
                  {valueFormatter(row.value)}
                </Text>
              </Group>
              <Progress
                value={total > 0 ? (row.value / total) * 100 : 0}
                color={row.tone}
                radius="xl"
                size="lg"
              />
            </Stack>
          ))}
        </Stack>
      </Stack>
    </Paper>
  );
}

function AlertCard({ alerts }: { alerts: ReportAlertRow[] }) {
  const severityColor: Record<ReportAlertRow["severity"], string> = {
    low: "teal",
    medium: "orange",
    high: "red",
  };

  return (
    <Paper withBorder radius="xl" p="xl">
      <Stack gap="lg">
        <div>
          <Title order={3} size="h4">
            Shepherding Watchlist
          </Title>
          <Text size="sm" c="dimmed">
            Assistive prompts for follow-up and pastoral attention.
          </Text>
        </div>

        <Stack gap="md">
          {alerts.map((alert) => (
            <Paper key={`${alert.title}-${alert.detail}`} withBorder radius="lg" p="md">
              <Group align="flex-start" wrap="nowrap">
                <ThemeIcon color={severityColor[alert.severity]} variant="light" radius="xl">
                  <AlertTriangle size={16} />
                </ThemeIcon>
                <div>
                  <Group gap="xs">
                    <Text fw={700} size="sm">
                      {alert.title}
                    </Text>
                    <Badge
                      size="xs"
                      radius="sm"
                      color={severityColor[alert.severity]}
                      variant="light"
                    >
                      {alert.severity}
                    </Badge>
                  </Group>
                  <Text size="sm" c="dimmed" mt={4}>
                    {alert.detail}
                  </Text>
                </div>
              </Group>
            </Paper>
          ))}
        </Stack>
      </Stack>
    </Paper>
  );
}

function FundTable({ rows }: { rows: FundBreakdownRow[] }) {
  return (
    <Paper withBorder radius="xl" p="xl">
      <Stack gap="lg">
        <div>
          <Title order={3} size="h4">
            Fund Breakdown
          </Title>
          <Text size="sm" c="dimmed">
            Amount, gift count, and donor reach by designation.
          </Text>
        </div>

        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Fund</Table.Th>
              <Table.Th>Amount</Table.Th>
              <Table.Th>Gifts</Table.Th>
              <Table.Th>Donor touches</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((row) => (
              <Table.Tr key={row.label}>
                <Table.Td>
                  <Group gap="xs">
                    <ThemeIcon color={row.tone} variant="light" radius="xl" size="sm">
                      <Coins size={13} />
                    </ThemeIcon>
                    <Text size="sm" fw={600}>
                      {row.label}
                    </Text>
                  </Group>
                </Table.Td>
                <Table.Td>{formatCurrency(row.amountCents)}</Table.Td>
                <Table.Td>{formatInteger(row.giftCount)}</Table.Td>
                <Table.Td>{formatInteger(row.donorCount)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Stack>
    </Paper>
  );
}

export function ReportsOverviewDashboard({
  members,
  events,
  giving,
  readinessView = false,
  dataSource = "live",
  readinessSummary = null,
}: {
  members: MemberReportsData;
  events: EventReportsData;
  giving: GivingReportsData;
  readinessView?: boolean;
  dataSource?: "preview" | "live";
  readinessSummary?: ReadinessSummary | null;
}) {
  const cards = [
    {
      href: `/app/reports/members?range=${members.range}`,
      title: "Members",
      description: "Attendance consistency, drift, and engagement mix.",
      icon: UsersRound,
      tone: "churchBlue",
      primary: `${formatInteger(members.summary.activePeople)} active`,
      secondary: `${formatInteger(members.summary.atRiskCount)} quiet-drift flags`,
    },
    {
      href: `/app/reports/events?range=${events.range}`,
      title: "Events",
      description: "Turnout, volunteer pressure, and visitor-generating moments.",
      icon: CalendarRange,
      tone: "teal",
      primary: `${formatInteger(events.summary.totalEvents)} events`,
      secondary: `${formatInteger(events.summary.pressuredEvents)} staffing pressure flags`,
    },
    {
      href: `/app/reports/giving?range=${giving.range}`,
      title: "Giving",
      description: "Generosity rhythm, fund health, and first-time givers.",
      icon: BarChart2,
      tone: "grape",
      primary: formatCurrency(giving.summary.totalAmountCents),
      secondary: `${formatInteger(giving.summary.firstTimeGiverCount)} first-time givers`,
    },
  ];
  const hasAnyReportData =
    members.summary.totalPeople > 0 ||
    events.summary.totalEvents > 0 ||
    giving.summary.giftCount > 0;
  const readinessState =
    dataSource === "preview"
      ? {
          state: "no-backend" as const,
          title: "Reports target unavailable",
          description:
            "Reports can be previewed, but live member, event, giving, finance, and budget coverage checks need tenant data.",
          detail: "Configure the tenant backend before using this target to clear readiness.",
        }
      : !hasAnyReportData
        ? {
            state: "empty" as const,
            title: "Reports need live operating data",
            description:
              "Add people, events, giving, finance journals, and budgets before reports can support readiness decisions.",
          }
        : readinessSummary && readinessSummary.issueCount > 0
          ? {
              state: "validation-error" as const,
              title: "Report inputs need attention",
              description: readinessSummary.recommendedAction,
              detail: readinessSummary.detail,
            }
          : {
              state: "completed" as const,
              title: "Reporting readiness is clear",
              description:
                "Member, event, giving, finance, and budget reporting inputs are present for the selected readiness window.",
              detail: readinessSummary?.detail,
            };

  return (
    <Stack gap="lg">
      {readinessView ? (
        <ReadinessTargetState
          {...readinessState}
          primaryAction={{ label: "Back to readiness", href: "/app/church-admin/readiness" }}
          secondaryAction={{ label: "Member report", href: `/app/reports/members?range=${members.range}` }}
        />
      ) : null}

      <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
        {cards.map((card) => (
          <Paper
            key={card.href}
            component={Link}
            href={card.href}
            withBorder
            radius="xl"
            p="xl"
            style={{
              textDecoration: "none",
              color: "inherit",
              background:
                card.tone === "teal"
                  ? "linear-gradient(180deg, rgba(240,253,250,1), rgba(255,255,255,1))"
                  : card.tone === "grape"
                    ? "linear-gradient(180deg, rgba(250,245,255,1), rgba(255,255,255,1))"
                    : "linear-gradient(180deg, rgba(239,246,255,1), rgba(255,255,255,1))",
            }}
          >
            <Stack gap="md">
              <Group justify="space-between">
                <ThemeIcon color={card.tone} variant="light" radius="xl" size="xl">
                  <card.icon size={18} />
                </ThemeIcon>
                <ArrowRight size={16} />
              </Group>
              <div>
                <Title order={3} size="h4">
                  {card.title}
                </Title>
                <Text size="sm" c="dimmed" mt={4}>
                  {card.description}
                </Text>
              </div>
              <div>
                <Text fw={800} size="xl">
                  {card.primary}
                </Text>
                <Text size="sm" c="dimmed">
                  {card.secondary}
                </Text>
              </div>
            </Stack>
          </Paper>
        ))}
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="md">
        <AlertCard alerts={members.driftAlerts} />
        <Paper withBorder radius="xl" p="xl">
          <Stack gap="lg">
            <div>
              <Title order={3} size="h4">
                Stewardship Weather
              </Title>
              <Text size="sm" c="dimmed">
                A fast pulse across people, events, and generosity.
              </Text>
            </div>

            <Stack gap="md">
              <div>
                <Group justify="space-between" mb={6}>
                  <Text size="sm" fw={600}>
                    Congregational activity
                  </Text>
                  <Text size="sm" fw={700}>
                    {formatPercent(
                      members.summary.totalPeople > 0
                        ? members.summary.activePeople / members.summary.totalPeople
                        : 0,
                    )}
                  </Text>
                </Group>
                <Progress
                  value={
                    members.summary.totalPeople > 0
                      ? (members.summary.activePeople / members.summary.totalPeople) * 100
                      : 0
                  }
                  color="churchBlue"
                  size="xl"
                  radius="xl"
                />
              </div>

              <div>
                <Group justify="space-between" mb={6}>
                  <Text size="sm" fw={600}>
                    Volunteer pressure
                  </Text>
                  <Text size="sm" fw={700}>
                    {formatInteger(events.summary.pressuredEvents)} flagged
                  </Text>
                </Group>
                <Progress
                  value={
                    events.summary.totalEvents > 0
                      ? (events.summary.pressuredEvents / events.summary.totalEvents) * 100
                      : 0
                  }
                  color="orange"
                  size="xl"
                  radius="xl"
                />
              </div>

              <div>
                <Group justify="space-between" mb={6}>
                  <Text size="sm" fw={600}>
                    Anonymous giving share
                  </Text>
                  <Text size="sm" fw={700}>
                    {formatPercent(giving.summary.anonymousGiftShare)}
                  </Text>
                </Group>
                <Progress
                  value={giving.summary.anonymousGiftShare * 100}
                  color="grape"
                  size="xl"
                  radius="xl"
                />
              </div>
            </Stack>
          </Stack>
        </Paper>
      </SimpleGrid>
    </Stack>
  );
}

export function MembersReportsDashboard({ data }: { data: MemberReportsData }) {
  return (
    <Stack gap="lg">
      <SimpleGrid cols={{ base: 1, sm: 2, xl: 5 }} spacing="md">
        <MetricCard
          label="People"
          value={formatInteger(data.summary.totalPeople)}
          detail="Current church-scoped profiles."
        />
        <MetricCard
          label="Active In Window"
          value={formatInteger(data.summary.activePeople)}
          detail="Attended or served within the selected range."
          tone="teal"
        />
        <MetricCard
          label="Visitors"
          value={formatInteger(data.summary.visitorCount)}
          detail="Profiles still tagged as visitors."
          tone="grape"
        />
        <MetricCard
          label="At Risk"
          value={formatInteger(data.summary.atRiskCount)}
          detail="No recent attendance and no active ministry connection."
          tone="orange"
        />
        <MetricCard
          label="Reachable"
          value={formatInteger(data.summary.contactableCount)}
          detail="Can be contacted under current data and consent settings."
          tone="lime"
        />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="md">
        <TrendCard
          title="Attendance Momentum"
          subtitle="Check-in activity across the selected range."
          points={data.attendanceTrend}
        />
        <BreakdownCard
          title="Membership Status"
          subtitle="How your people records are currently distributed."
          rows={data.statusBreakdown}
        />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="md">
        <BreakdownCard
          title="Attendance Recency"
          subtitle="How recently members were seen in recorded attendance."
          rows={data.recencyBreakdown}
        />
        <BreakdownCard
          title="Engagement Mix"
          subtitle="Attending, serving, and disconnected population groups."
          rows={data.engagementBreakdown}
        />
      </SimpleGrid>

      <AlertCard alerts={data.driftAlerts} />
    </Stack>
  );
}

export function EventsReportsDashboard({ data }: { data: EventReportsData }) {
  return (
    <Stack gap="lg">
      <SimpleGrid cols={{ base: 1, sm: 2, xl: 5 }} spacing="md">
        <MetricCard
          label="Events"
          value={formatInteger(data.summary.totalEvents)}
          detail="Scheduled events in the selected range."
        />
        <MetricCard
          label="Attendance"
          value={formatInteger(data.summary.attendanceTotal)}
          detail="Recorded check-ins across all events."
          tone="teal"
        />
        <MetricCard
          label="Average Turnout"
          value={formatInteger(data.summary.averageAttendance)}
          detail="Average attendance per event."
          tone="grape"
        />
        <MetricCard
          label="Visitor Touches"
          value={formatInteger(data.summary.visitorTouches)}
          detail="Visitor attendances captured during the range."
          tone="orange"
        />
        <MetricCard
          label="Pressure Flags"
          value={formatInteger(data.summary.pressuredEvents)}
          detail="Events where turnout may be straining available volunteers."
          tone="red"
        />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="md">
        <TrendCard
          title="Attendance Curve"
          subtitle="Total event check-ins over the selected range."
          points={data.attendanceTrend}
        />
        <BreakdownCard
          title="Category Yield"
          subtitle="Where turnout is coming from across event categories."
          rows={data.categoryBreakdown}
        />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="md">
        <BreakdownCard
          title="Weekday Rhythm"
          subtitle="Which days are carrying the event load."
          rows={data.weekdayBreakdown}
        />
        <BreakdownCard
          title="Check-In Methods"
          subtitle="How attendance is being recorded in practice."
          rows={data.checkInMethodBreakdown}
        />
      </SimpleGrid>

      <Paper withBorder radius="xl" p="xl">
        <Stack gap="lg">
          <div>
            <Title order={3} size="h4">
              Top Events
            </Title>
            <Text size="sm" c="dimmed">
              Highest-turnout events in the selected range, with staffing pressure context.
            </Text>
          </div>

          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Event</Table.Th>
                <Table.Th>Attendance</Table.Th>
                <Table.Th>Roster</Table.Th>
                <Table.Th>Visitors</Table.Th>
                <Table.Th>Pressure</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data.topEvents.map((event) => (
                <Table.Tr key={event.id}>
                  <Table.Td>
                    <Stack gap={2}>
                      <Text
                        component={Link}
                        href={`/app/church-admin/events/${event.id}`}
                        fw={700}
                        size="sm"
                        style={{ textDecoration: "none", color: "inherit" }}
                      >
                        {event.title}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {toDisplay(event.category)} · {formatDate(event.startsAt)}
                      </Text>
                    </Stack>
                  </Table.Td>
                  <Table.Td>{formatInteger(event.attendanceCount)}</Table.Td>
                  <Table.Td>{formatInteger(event.rosterCount)}</Table.Td>
                  <Table.Td>{formatInteger(event.visitorCount)}</Table.Td>
                  <Table.Td>
                    <Badge
                      color={event.pressureRatio >= 10 ? "orange" : "teal"}
                      variant="light"
                      radius="sm"
                    >
                      {event.pressureRatio.toFixed(1)} attendees / volunteer
                    </Badge>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Stack>
      </Paper>
    </Stack>
  );
}

export function GivingReportsDashboard({ data }: { data: GivingReportsData }) {
  return (
    <Stack gap="lg">
      <SimpleGrid cols={{ base: 1, sm: 2, xl: 5 }} spacing="md">
        <MetricCard
          label="Total Given"
          value={formatCurrency(data.summary.totalAmountCents)}
          detail="Succeeded gifts in the selected range."
        />
        <MetricCard
          label="Gift Count"
          value={formatInteger(data.summary.giftCount)}
          detail="Total successful gifts in the range."
          tone="teal"
        />
        <MetricCard
          label="Recurring Donors"
          value={formatInteger(data.summary.recurringDonorCount)}
          detail="Profiles with recurring giving activity."
          tone="grape"
        />
        <MetricCard
          label="First-Time Givers"
          value={formatInteger(data.summary.firstTimeGiverCount)}
          detail="Profiles whose earliest gift lands in the selected range."
          tone="orange"
        />
        <MetricCard
          label="Anonymous Share"
          value={formatPercent(data.summary.anonymousGiftShare)}
          detail="Percentage of gifts marked anonymous."
          tone="lime"
        />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="md">
        <TrendCard
          title="Giving Rhythm"
          subtitle="Gift value trend across the selected range."
          points={data.givingTrend}
          tone="grape"
          formatter={formatCurrency}
        />
        <BreakdownCard
          title="Donor Journey"
          subtitle="How generosity is moving across new, returning, recurring, and anonymous behaviors."
          rows={data.donorJourneyBreakdown}
        />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="md">
        <FundTable rows={data.fundBreakdown} />
        <BreakdownCard
          title="Gift Mix"
          subtitle="Recurring, one-time, and anonymous composition of giving in the selected range."
          rows={data.giftMixBreakdown}
        />
      </SimpleGrid>
    </Stack>
  );
}

function toDisplay(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
