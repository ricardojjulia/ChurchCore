"use client";

import Link from "next/link";
import {
  BrainCircuit,
  HeartHandshake,
  ShieldCheck,
  Sparkles,
  UsersRound,
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
import { ChurchAdminWorkspaceDetails } from "@/components/application/church-admin-workspace-details";
import type { AuthSession } from "@/lib/auth";
import type { ChurchAdminWorkspaceState } from "@/lib/application-state";
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
}: {
  role: PortalRole;
  session: AuthSession;
  churchAdminState?: ChurchAdminWorkspaceState | null;
}) {
  const churchContext = session.appContext.kind === "church" ? session.appContext : null;
  const ActiveIcon = roleIcons[role.id];
  const workspaceHref = session.homePath;
  const navItems = [
    {
      href: session.homePath,
      label: role.label,
      description: churchContext ? churchContext.church.name : role.audience,
      icon: roleIcons[role.id],
      active: true,
    },
  ];

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
      topActions={
        <Group gap="sm" wrap="wrap" justify="flex-end">
          <Button component={Link} href="/app/calendar" radius="xl">
            Calendar
          </Button>
        </Group>
      }
    >
      <ChurchAppContextBanner session={session} />

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
        <ChurchAdminWorkspaceDetails initialState={churchAdminState} />
      ) : null}
    </ApplicationShell>
  );
}
