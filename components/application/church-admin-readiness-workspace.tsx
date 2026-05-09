"use client";

import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  DollarSign,
  HeartHandshake,
  Settings,
  ShieldCheck,
  UserPlus,
  Users,
  UsersRound,
  XCircle,
} from "lucide-react";
import {
  Badge,
  Button,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";

import { ApplicationShell } from "@/components/application/app-shell";
import { ChurchAppContextBanner } from "@/components/application/church-app-context-banner";
import type { ChurchAppSession } from "@/lib/auth";
import type {
  ChurchAdminReadinessData,
  ChurchAdminReadinessItem,
  ReadinessStatus,
} from "@/lib/church-admin-readiness-data";

const statusMeta: Record<
  ReadinessStatus,
  {
    label: string;
    color: string;
    icon: React.ComponentType<{ size?: number }>;
  }
> = {
  ready: {
    label: "Ready",
    color: "teal",
    icon: CheckCircle2,
  },
  attention: {
    label: "Review",
    color: "yellow",
    icon: AlertTriangle,
  },
  blocked: {
    label: "Blocked",
    color: "red",
    icon: XCircle,
  },
};

function ReadinessCard({ item }: { item: ChurchAdminReadinessItem }) {
  const meta = statusMeta[item.status];
  const Icon = meta.icon;

  return (
    <Paper withBorder radius="lg" p="lg">
      <Stack gap="md">
        <Group justify="space-between" align="flex-start" gap="md">
          <Group gap="sm" align="flex-start">
            <ThemeIcon color={meta.color} variant="light" radius="xl" size="lg">
              <Icon size={18} />
            </ThemeIcon>
            <div>
              <Group gap="xs" mb={4}>
                <Text fw={700}>{item.title}</Text>
                <Badge color={meta.color} variant="light">
                  {meta.label}
                </Badge>
              </Group>
              <Text size="sm" c="dimmed">
                {item.description}
              </Text>
            </div>
          </Group>
        </Group>

        <Text size="sm">{item.detail}</Text>

        <Button component="a" href={item.href} variant="default" radius="xl" size="sm">
          Open workflow
        </Button>
      </Stack>
    </Paper>
  );
}

export function ChurchAdminReadinessWorkspace({
  session,
  data,
}: {
  session: ChurchAppSession;
  data: ChurchAdminReadinessData;
}) {
  const overallStatus =
    data.blockedCount > 0
      ? "Blocked items need attention before Sunday."
      : data.attentionCount > 0
        ? "Review the remaining items before calling the week ready."
        : "The weekly readiness path is clear.";

  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/church-admin"
      calendarHref="/app/calendar"
      sectionLabel="ChurchAdmin"
      title="Weekly Readiness"
      description={session.appContext.church.name}
      sidebarTitle="MVP readiness"
      sidebarDescription="Run the church-admin weekly operating path."
      navLabel="Church admin"
      navItems={[
        {
          href: "/app/church-admin",
          label: "Home",
          description: "Operations",
          icon: HeartHandshake,
        },
        {
          href: "/app/church-admin/readiness",
          label: "Readiness",
          description: "Weekly launch path",
          icon: ClipboardCheck,
          active: true,
        },
        {
          href: "/app/church-admin/settings",
          label: "Settings",
          description: "Church setup",
          icon: Settings,
        },
        {
          href: "/app/church-admin/accounts",
          label: "Account Requests",
          description: "Portal approvals",
          icon: UserPlus,
        },
        {
          href: "/app/church-admin/people",
          label: "People",
          description: "Records and households",
          icon: UsersRound,
        },
        {
          href: "/app/church-admin/events",
          label: "Events",
          description: "Rosters and check-in",
          icon: ClipboardCheck,
        },
        {
          href: "/app/church-admin/children",
          label: "Children's Ministry",
          description: "Check-in and safety",
          icon: ShieldCheck,
        },
        {
          href: "/app/church-admin/volunteers",
          label: "Volunteers",
          description: "Scheduling",
          icon: Users,
        },
        {
          href: "/app/church-admin/giving",
          label: "Giving Ops",
          description: "Analytics and GL",
          icon: DollarSign,
        },
        {
          href: "/app/reports",
          label: "Reports",
          description: "Dashboards and trends",
          icon: BarChart3,
        },
      ]}
    >
      <ChurchAppContextBanner session={session} />

      <Paper withBorder radius="xl" p="xl">
        <Group justify="space-between" align="flex-start" gap="lg">
          <div>
            <Badge color={data.source === "live" ? "teal" : "gray"} variant="light" mb="sm">
              {data.source === "live" ? "Live tenant data" : "Preview"}
            </Badge>
            <Title order={1}>Weekly readiness</Title>
            <Text c="dimmed" mt="sm" maw={720}>
              Use this path to decide whether a church admin can run the week from setup through reports.
            </Text>
          </div>
          <Button component="a" href="/app/church-admin" radius="xl" variant="default">
            Back to dashboard
          </Button>
        </Group>
      </Paper>

      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
        <Paper withBorder radius="lg" p="lg">
          <Text size="xs" tt="uppercase" fw={700} c="dimmed">
            Ready
          </Text>
          <Title order={2} mt={4}>
            {data.readyCount}
          </Title>
        </Paper>
        <Paper withBorder radius="lg" p="lg">
          <Text size="xs" tt="uppercase" fw={700} c="dimmed">
            Needs Review
          </Text>
          <Title order={2} mt={4}>
            {data.attentionCount}
          </Title>
        </Paper>
        <Paper withBorder radius="lg" p="lg">
          <Text size="xs" tt="uppercase" fw={700} c="dimmed">
            Blocked
          </Text>
          <Title order={2} mt={4}>
            {data.blockedCount}
          </Title>
        </Paper>
      </SimpleGrid>

      <Paper withBorder radius="xl" p="xl">
        <Group gap="sm" mb="lg">
          <ThemeIcon color={data.blockedCount > 0 ? "red" : "teal"} variant="light" radius="xl" size="lg">
            {data.blockedCount > 0 ? <XCircle size={18} /> : <CheckCircle2 size={18} />}
          </ThemeIcon>
          <div>
            <Title order={2} size="h3">
              MVP operating path
            </Title>
            <Text size="sm" c="dimmed">
              {overallStatus}
            </Text>
          </div>
        </Group>

        <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
          {data.items.map((item) => (
            <ReadinessCard key={item.id} item={item} />
          ))}
        </SimpleGrid>
      </Paper>
    </ApplicationShell>
  );
}
