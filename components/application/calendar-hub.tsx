"use client";

import { CalendarRange, Clock3, Layers3, ListTodo } from "lucide-react";
import {
  Badge,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";

import { ApplicationShell } from "@/components/application/app-shell";
import { CalendarLiveBoard } from "@/components/application/calendar-live-board";
import { ChurchAppContextBanner } from "@/components/application/church-app-context-banner";
import type { AuthSession } from "@/lib/auth";
import type { ChurchCalendarData } from "@/lib/church-calendar-data";
import { getPortalRole } from "@/lib/portal";

function formatCategory(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

export function CalendarHub({
  session,
  data,
}: {
  session: AuthSession;
  data: ChurchCalendarData;
}) {
  if (session.appContext.kind !== "church") {
    throw new Error("CalendarHub requires a church app context.");
  }

  const activeRole = getPortalRole(session.appContext.roleId);
  const workspaceHref = session.homePath;
  const navItems = activeRole
    ? [
        {
          href: session.homePath,
          label: activeRole.label,
          description: session.appContext.church.name,
          icon:
            activeRole.id === "church-admin"
              ? CalendarRange
              : activeRole.id === "pastor"
                ? Clock3
                : activeRole.id === "ministry-leader"
                  ? Layers3
                  : ListTodo,
          active: true,
        },
      ]
    : [];

  const metrics = [
    {
      label: "Upcoming",
      value: String(data.events.length),
    },
    {
      label: "Categories",
      value: String(data.categoryCounts.length),
    },
    {
      label: "Needs approval",
      value: String(data.pendingApprovals.length),
    },
  ];
  const canManageEvents =
    session.appContext.roleId === "church-admin" ||
    session.appContext.roleId === "pastor" ||
    session.appContext.roleId === "ministry-leader";
  const canOpenEventWorkspace =
    session.appContext.roleId === "church-admin" ||
    session.appContext.roleId === "pastor";

  return (
    <ApplicationShell
      session={session}
      workspaceHref={workspaceHref}
      calendarHref="/app/calendar"
      sectionLabel="Calendar"
      title="Calendar"
      description={session.appContext.church.name}
      sidebarTitle="Working calendar"
      sidebarDescription="Events and approvals"
      navLabel="Current role"
      navItems={navItems}
    >
      <ChurchAppContextBanner session={session} />

      <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
        {metrics.map((metric) => (
          <Paper key={metric.label} withBorder p="lg">
            <Text size="xs" tt="uppercase" fw={700} c="dimmed">
              {metric.label}
            </Text>
            <Title order={3} mt="xs">
              {metric.value}
            </Title>
          </Paper>
        ))}
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="lg">
        <CalendarLiveBoard
          events={data.events}
          churchTimeZone={session.appContext.church.timezone}
          canManageEvents={canManageEvents}
          canOpenEventWorkspace={canOpenEventWorkspace}
        />

        <Stack gap="lg">
          <Paper withBorder p="xl">
            <Title order={3} size="h4">
              Categories
            </Title>
            <Stack gap="sm" mt="lg">
              {data.categoryCounts.length ? (
                data.categoryCounts.map((item) => (
                  <Group key={item.category} justify="space-between">
                    <Text>{formatCategory(item.category)}</Text>
                    <Badge color="gray" variant="light">
                      {item.count}
                    </Badge>
                  </Group>
                ))
              ) : (
                <Text c="dimmed" size="sm">
                  No upcoming events.
                </Text>
              )}
            </Stack>
          </Paper>

          <Paper withBorder p="xl">
            <Title order={3} size="h4">
              Approval queue
            </Title>
            <Stack gap="sm" mt="lg">
              {data.pendingApprovals.length ? (
                data.pendingApprovals.map((event) => (
                  <Paper key={event.id} p="md" bg="gray.0">
                    <Text fw={600}>{event.title}</Text>
                    <Text size="sm" c="dimmed" mt={6}>
                      {formatCategory(event.category)}
                      {event.ministryName ? ` • ${event.ministryName}` : ""}
                    </Text>
                  </Paper>
                ))
              ) : (
                <Text c="dimmed" size="sm">
                  Nothing waiting on approval.
                </Text>
              )}
            </Stack>
          </Paper>
        </Stack>
      </SimpleGrid>
    </ApplicationShell>
  );
}
