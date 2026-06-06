"use client";

import Link from "next/link";
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
  PhoneCall,
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
import { useI18n } from "@/components/i18n-provider";
import type { AuthSession } from "@/lib/auth";
import type { ChurchAdminWorkspaceState } from "@/lib/application-state";
import type { ChurchAdminDashboardSummary } from "@/lib/church-admin-dashboard-data";
import type { ChurchAdminOperationsData } from "@/lib/church-admin-operations-data";
import { type PortalRole, type PortalRoleId } from "@/lib/portal";

const roleIcons: Record<PortalRoleId, React.ComponentType<{ size?: number; className?: string }>> = {
  "super-admin": ShieldCheck,
  "church-admin": HeartHandshake,
  secretary: PhoneCall,
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
  const { t } = useI18n();
  const pathname = usePathname();
  const churchContext = session.appContext.kind === "church" ? session.appContext : null;
  const ActiveIcon = roleIcons[role.id];
  const workspaceHref = session.homePath;
  const isActiveHref = (href: string) =>
    pathname === href || (href !== session.homePath && pathname.startsWith(`${href}/`));
  const navItems = [
    {
      href: session.homePath,
      label: t("portalNav", "home"),
      description: churchContext ? churchContext.church.name : role.audience,
      icon: roleIcons[role.id],
      active: isActiveHref(session.homePath),
    },
  ];

  if (role.id === "church-admin") {
    navItems.push(
      {
        href: "/app/church-admin/readiness",
        label: t("portalNav", "readiness"),
        description: t("portalNav", "readinessDescription"),
        icon: ClipboardCheck,
        active: isActiveHref("/app/church-admin/readiness"),
      },
      {
        href: "/app/church-admin/settings",
        label: t("portalNav", "settings"),
        description: t("portalNav", "churchSetup"),
        icon: Settings,
        active: isActiveHref("/app/church-admin/settings"),
      },
      {
        href: "/app/daily-desk",
        label: t("portalNav", "dailyDesk"),
        description: t("portalNav", "dailyDeskDescription"),
        icon: PhoneCall,
        active: isActiveHref("/app/daily-desk"),
      },
      {
        href: "/app/church-admin/people",
        label: t("portalNav", "people"),
        description: t("portalNav", "peopleDescription"),
        icon: UsersRound,
        active: isActiveHref("/app/church-admin/people"),
      },
      {
        href: "/app/church-admin/accounts",
        label: t("portalNav", "accountRequests"),
        description: t("portalNav", "accountRequestsDescription"),
        icon: UserPlus,
        active: isActiveHref("/app/church-admin/accounts"),
      },
      {
        href: "/app/communications",
        label: t("portalNav", "communications"),
        description: t("portalNav", "communicationsDescription"),
        icon: MessageSquare,
        active: isActiveHref("/app/communications"),
      },
      {
        href: "/app/giving",
        label: t("portalNav", "donations"),
        description: t("portalNav", "donationsDescription"),
        icon: DollarSign,
        active: isActiveHref("/app/giving"),
      },
      {
        href: "/app/church-admin/ministry",
        label: t("portalNav", "ministryForge"),
        description: t("portalNav", "ministryForgeDescription"),
        icon: Sparkles,
        active: isActiveHref("/app/church-admin/ministry"),
      },
      {
        href: "/app/church-admin/workflows",
        label: t("portalNav", "suggestedWorkflows"),
        description: t("portalNav", "suggestedWorkflowsDescription"),
        icon: ClipboardCheck,
        active: isActiveHref("/app/church-admin/workflows"),
      },
      {
        href: "/app/church-admin/finance",
        label: t("portalNav", "finance"),
        description: t("portalNav", "financeDescription"),
        icon: Landmark,
        active: isActiveHref("/app/church-admin/finance"),
      },
      {
        href: "/app/reports",
        label: t("portalNav", "reports"),
        description: t("portalNav", "reportsDescription"),
        icon: BarChart3,
        active: isActiveHref("/app/reports"),
      },
      {
        href: "/app/church-admin/children",
        label: t("portalNav", "childrenMinistry"),
        description: t("portalNav", "childrenMinistryDescription"),
        icon: ShieldCheck,
        active: isActiveHref("/app/church-admin/children"),
      },
      {
        href: "/app/church-admin/groups",
        label: t("portalNav", "smallGroups"),
        description: t("portalNav", "smallGroupsDescription"),
        icon: Users,
        active: isActiveHref("/app/church-admin/groups"),
      },
      {
        href: "/app/church-admin/events",
        label: t("portalNav", "events"),
        description: t("portalNav", "eventsDescription"),
        icon: Calendar,
        active: isActiveHref("/app/church-admin/events"),
      },
      {
        href: "/app/church-admin/attendance",
        label: t("portalNav", "attendance"),
        description: t("portalNav", "attendanceDescription"),
        icon: Calendar,
        active: isActiveHref("/app/church-admin/attendance"),
      },
      {
        href: "/app/church-admin/volunteers",
        label: t("portalNav", "volunteers"),
        description: t("portalNav", "volunteersDescription"),
        icon: Users,
        active: isActiveHref("/app/church-admin/volunteers"),
      },
      {
        href: "/app/church-admin/visitors",
        label: t("portalNav", "visitors"),
        description: t("portalNav", "visitorsDescription"),
        icon: UsersRound,
        active: isActiveHref("/app/church-admin/visitors"),
      },
      {
        href: "/app/church-admin/giving",
        label: t("portalNav", "givingOps"),
        description: t("portalNav", "givingOpsDescription"),
        icon: DollarSign,
        active: isActiveHref("/app/church-admin/giving"),
      },
    );
  }

  if (role.id === "secretary") {
    navItems.push(
      {
        href: "/app/daily-desk",
        label: t("portalNav", "dailyDesk"),
        description: t("portalNav", "dailyDeskDescription"),
        icon: PhoneCall,
        active: isActiveHref("/app/daily-desk"),
      },
      {
        href: "/app/calendar",
        label: t("portalNav", "calendar"),
        description: t("portalNav", "calendarDescription"),
        icon: Calendar,
        active: isActiveHref("/app/calendar"),
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
      sidebarTitle={t("portalNav", "churchApp")}
      sidebarDescription={role.label}
      navLabel={t("portalNav", "currentRole")}
      navItems={navItems}
    >
      <ChurchAppContextBanner session={session} />

      {role.id === "church-admin" && churchAdminSummary ? (
        <ChurchAdminDashboardSummaryCards summary={churchAdminSummary} />
      ) : null}

      <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="lg">
        <Paper
          radius="lg"
          p="xl"
          style={{
            background:
              "linear-gradient(135deg, rgba(255,255,255,0.96), rgba(238,247,246,0.92))",
            border: "1px solid rgba(16, 24, 39, 0.1)",
            boxShadow: "0 18px 48px rgba(16, 24, 39, 0.08)",
          }}
        >
          <Group gap="sm" mb="md">
            <ThemeIcon color="teal" variant="light" radius="md" size="lg">
              <ActiveIcon size={18} />
            </ThemeIcon>
            <Badge color="dark" variant="light" radius="sm">
              {role.label}
            </Badge>
          </Group>

          <Title order={2} c="#101827">{session.profile.name}</Title>
          <Text c="#617184" mt="sm">
            {session.profile.title}
          </Text>
          {churchContext ? (
            <Text size="sm" mt="sm" c="#0f766e" fw={700}>
              {churchContext.church.name}
            </Text>
          ) : null}
        </Paper>

        <Paper
          radius="lg"
          p="xl"
          style={{
            background: "#ffffff",
            border: "1px solid rgba(16, 24, 39, 0.1)",
            boxShadow: "0 18px 48px rgba(16, 24, 39, 0.08)",
          }}
        >
          <Group justify="space-between" align="center">
            <Title order={3} size="h4" c="#101827">
              {t("portalNav", "next")}
            </Title>
            <Badge color="teal" variant="light" radius="sm">
              {t("portalNav", "focusPath")}
            </Badge>
          </Group>
          <Stack gap="sm" mt="lg">
            {(role.id === "church-admin"
              ? [
                  {
                    title: t("portalNav", "people"),
                    description: t("portalNav", "peopleDescription"),
                    href: "/app/church-admin/people",
                    gradient: "linear-gradient(135deg, rgba(96, 165, 250, 0.12), rgba(255, 255, 255, 0.82))",
                    border: "1px solid rgba(96, 165, 250, 0.22)",
                  },
                  {
                    title: t("portalNav", "events"),
                    description: t("portalNav", "eventsDescription"),
                    href: "/app/church-admin/events",
                    gradient: "linear-gradient(135deg, rgba(94, 234, 212, 0.14), rgba(255, 255, 255, 0.86))",
                    border: "1px solid rgba(15, 118, 110, 0.2)",
                  },
                ]
              : [
                  {
                    title: t("portalNav", "calendar"),
                    description: t("portalNav", "reviewCalendar"),
                    href: "/app/calendar",
                    gradient: "linear-gradient(135deg, rgba(96, 165, 250, 0.12), rgba(255, 255, 255, 0.82))",
                    border: "1px solid rgba(96, 165, 250, 0.22)",
                  },
                  {
                    title: t("portalNav", "profile"),
                    description: t("portalNav", "profileActive"),
                    href: session.homePath,
                    gradient: "linear-gradient(135deg, rgba(94, 234, 212, 0.14), rgba(255, 255, 255, 0.86))",
                    border: "1px solid rgba(15, 118, 110, 0.2)",
                  },
                ]
            ).map((s) => (
              <Link key={s.href} href={s.href} style={{ textDecoration: "none", display: "block" }}>
                <Paper
                  p="md"
                  radius="md"
                  style={{
                    background: s.gradient,
                    border: s.border,
                    cursor: "pointer",
                  }}
                >
                  <Text fw={750} c="#101827">{s.title}</Text>
                  <Text c="#617184" size="sm" mt={6}>{s.description}</Text>
                </Paper>
              </Link>
            ))}
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
