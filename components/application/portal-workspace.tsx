"use client";

import { usePathname } from "next/navigation";
import {
  BarChart3,
  BrainCircuit,
  Calendar,
  ClipboardCheck,
  DollarSign,
  HeartHandshake,
  Landmark,
  MessageSquare,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  UserPlus,
  UsersRound,
} from "lucide-react";
import {
  Badge,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";

import { ApplicationShell } from "@/components/application/app-shell";
import { ChurchAdminDashboardSummaryCards } from "@/components/application/church-admin-dashboard-summary";
import { ChurchAppContextBanner } from "@/components/application/church-app-context-banner";
import { ChurchAdminWorkspaceDetails } from "@/components/application/church-admin-workspace-details";
import type { AuthSession } from "@/lib/auth";
import type { ChurchAdminWorkspaceState } from "@/lib/application-state";
import type { ChurchAdminDashboardSummary } from "@/lib/church-admin-dashboard-data";
import type { ChurchAdminOperationsData } from "@/lib/church-admin-operations-data";
import { type PortalRole, type PortalRoleId } from "@/lib/portal";

const roleIcons: Record<PortalRoleId, React.ComponentType<{ size?: number; className?: string }>> = {
  "super-admin": ShieldCheck,
  "church-admin": HeartHandshake,
  pastor: BrainCircuit,
  "ministry-leader": UsersRound,
  member: Sparkles,
};

export function PortalWorkspace({
  role,
  session,
  churchAdminState,
  churchAdminSummary,
  churchAdminOperations,
}: {
  role: PortalRole;
  session: AuthSession;
  churchAdminState?: ChurchAdminWorkspaceState | null;
  churchAdminSummary?: ChurchAdminDashboardSummary | null;
  churchAdminOperations?: ChurchAdminOperationsData | null;
}) {
  const pathname = usePathname();
  const churchContext = session.appContext.kind === "church" ? session.appContext : null;
  const ActiveIcon = roleIcons[role.id];
  const workspaceHref = session.homePath;
  const isActiveHref = (href: string) =>
    pathname === href || (href !== session.homePath && pathname.startsWith(`${href}/`));
  const navItems = [
    {
      href: session.homePath,
      label: "Home",
      description: churchContext ? churchContext.church.name : role.audience,
      icon: roleIcons[role.id],
      active: isActiveHref(session.homePath),
    },
  ];

  if (role.id === "church-admin") {
    navItems.push(
      {
        href: "/app/church-admin/settings",
        label: "Settings",
        description: "Church setup",
        icon: Settings,
        active: false,
      },
      {
        href: "/app/church-admin/people",
        label: "People",
        description: "Records and statuses",
        icon: UsersRound,
        active: isActiveHref("/app/church-admin/people"),
      },
      {
        href: "/app/church-admin/accounts",
        label: "Account Requests",
        description: "Portal approvals",
        icon: UserPlus,
        active: isActiveHref("/app/church-admin/accounts"),
      },
      {
        href: "/app/communications",
        label: "Communications",
        description: "Broadcast and messaging",
        icon: MessageSquare,
        active: isActiveHref("/app/communications"),
      },
      {
        href: "/app/giving",
        label: "Donations",
        description: "Donations dashboard",
        icon: DollarSign,
        active: isActiveHref("/app/giving"),
      },
      {
        href: "/app/church-admin/ministry",
        label: "Ministry Forge",
        description: "Health, vision, and impact",
        icon: Sparkles,
        active: isActiveHref("/app/church-admin/ministry"),
      },
      {
        href: "/app/church-admin/workflows",
        label: "Suggested Workflows",
        description: "Review ministry actions",
        icon: ClipboardCheck,
        active: isActiveHref("/app/church-admin/workflows"),
      },
      {
        href: "/app/church-admin/finance",
        label: "Finance",
        description: "Accounts, budgets & journals",
        icon: Landmark,
        active: isActiveHref("/app/church-admin/finance"),
      },
      {
        href: "/app/reports",
        label: "Reports",
        description: "Dashboards and trends",
        icon: BarChart3,
        active: isActiveHref("/app/reports"),
      },
      {
        href: "/app/church-admin/children",
        label: "Children's Ministry",
        description: "Check-in, safety & roster",
        icon: ShieldCheck,
        active: isActiveHref("/app/church-admin/children"),
      },
      {
        href: "/app/church-admin/groups",
        label: "Small Groups",
        description: "Group directory & attendance",
        icon: Users,
        active: isActiveHref("/app/church-admin/groups"),
      },
      {
        href: "/app/church-admin/events",
        label: "Events",
        description: "Event roster & check-in",
        icon: Calendar,
        active: isActiveHref("/app/church-admin/events"),
      },
      {
        href: "/app/church-admin/attendance",
        label: "Attendance",
        description: "Service headcounts & trends",
        icon: Calendar,
        active: isActiveHref("/app/church-admin/attendance"),
      },
      {
        href: "/app/church-admin/volunteers",
        label: "Volunteers",
        description: "Scheduling, hours & directory",
        icon: Users,
        active: isActiveHref("/app/church-admin/volunteers"),
      },
      {
        href: "/app/church-admin/visitors",
        label: "Visitors",
        description: "First-visit follow-up pipeline",
        icon: UsersRound,
        active: isActiveHref("/app/church-admin/visitors"),
      },
      {
        href: "/app/church-admin/giving",
        label: "Giving Ops",
        description: "Analytics & fund GL mappings",
        icon: DollarSign,
        active: isActiveHref("/app/church-admin/giving"),
      },
    );
  }

  return (
    <ApplicationShell
      session={session}
      workspaceHref={workspaceHref}
      calendarHref="/app/calendar"
      sectionLabel={role.label}
      title={churchContext?.church.name ?? role.label}
      description={role.label}
      sidebarTitle="Church app"
      sidebarDescription={role.label}
      navLabel="Current role"
      navItems={navItems}
    >
      <ChurchAppContextBanner session={session} />

      {role.id === "church-admin" && churchAdminSummary ? (
        <ChurchAdminDashboardSummaryCards summary={churchAdminSummary} />
      ) : null}

      <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="lg">
        <Paper withBorder p="xl">
          <Group gap="sm" mb="md">
            <ThemeIcon color="gray" variant="light" radius="xl" size="lg">
              <ActiveIcon size={18} />
            </ThemeIcon>
            <Badge color="gray" variant="light">
              {role.label}
            </Badge>
          </Group>

          <Title order={2}>{session.profile.name}</Title>
          <Text c="dimmed" mt="sm">
            {session.profile.title}
          </Text>
          {churchContext ? (
            <Text size="sm" mt="sm">
              {churchContext.church.name}
            </Text>
          ) : null}
        </Paper>

        <Paper withBorder p="xl">
          <Title order={3} size="h4">
            Next
          </Title>
          <Stack gap="sm" mt="lg">
            <Paper p="md" bg="gray.0">
              <Text fw={600}>Calendar</Text>
              <Text c="dimmed" size="sm" mt={6}>
                Review upcoming events and approvals.
              </Text>
            </Paper>
            <Paper p="md" bg="gray.0">
              <Text fw={600}>Profile</Text>
              <Text c="dimmed" size="sm" mt={6}>
                Church-scoped identity is active.
              </Text>
            </Paper>
          </Stack>
        </Paper>
      </SimpleGrid>

      {role.id === "church-admin" && churchAdminState ? (
        <ChurchAdminWorkspaceDetails
          initialState={churchAdminState}
          operationsData={churchAdminOperations}
        />
      ) : null}
    </ApplicationShell>
  );
}
