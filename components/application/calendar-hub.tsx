"use client";

import { useMemo, useState } from "react";
import { CalendarRange, Clock3, Layers3, ListTodo } from "lucide-react";
import {
  Button,
  Group,
  Paper,
  ScrollArea,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";

import { ApplicationShell } from "@/components/application/app-shell";
import { CalendarLiveBoard } from "@/components/application/calendar-live-board";
import { ChurchAppContextBanner } from "@/components/application/church-app-context-banner";
import { MemberBottomNav } from "@/components/application/member-bottom-nav";
import type { AuthSession } from "@/lib/auth";
import type { ChurchCalendarData } from "@/lib/church-calendar-data";
import { formatCategory, getCategoryColor } from "@/lib/calendar-utils";
import { getPortalRole } from "@/lib/portal";

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

  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"month" | "week" | "day">("month");

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

  const canManageEvents =
    session.appContext.roleId === "church-admin" ||
    session.appContext.roleId === "pastor" ||
    session.appContext.roleId === "ministry-leader";
  const canOpenEventWorkspace =
    session.appContext.roleId === "church-admin" ||
    session.appContext.roleId === "pastor";
  const isMemberRole = session.appContext.roleId === "member";

  const categories = useMemo(
    () => ["all", ...new Set(data.events.map((e) => e.category))],
    [data.events],
  );

  const visibleEvents = useMemo(
    () =>
      activeCategory === "all"
        ? data.events
        : data.events.filter((e) => e.category === activeCategory),
    [activeCategory, data.events],
  );

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
      bottomNav={isMemberRole ? <MemberBottomNav /> : undefined}
    >
      <ChurchAppContextBanner session={session} />

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
        {/* Upcoming */}
        <Paper withBorder p="lg">
          <Text size="xs" tt="uppercase" fw={700} c="dimmed">
            Upcoming
          </Text>
          <Title order={3} mt="xs">
            {data.events.length}
          </Title>
        </Paper>

        {/* Categories count */}
        <Paper withBorder p="lg">
          <Text size="xs" tt="uppercase" fw={700} c="dimmed">
            Categories
          </Text>
          <Title order={3} mt="xs">
            {data.categoryCounts.length}
          </Title>
        </Paper>

        {/* Category Breakdown */}
        <Paper withBorder p="lg" h="100%">
          <Text size="xs" tt="uppercase" fw={700} c="dimmed" mb={4}>
            Category Breakdown
          </Text>
          <ScrollArea.Autosize mah={120}>
            {data.categoryCounts.length ? (
              data.categoryCounts.map((item) => (
                <Group key={item.category} justify="space-between" py={2}>
                  <Group gap={6}>
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        backgroundColor: getCategoryColor(item.category),
                        flexShrink: 0,
                      }}
                    />
                    <Text size="xs">{formatCategory(item.category)}</Text>
                  </Group>
                  <Text size="xs" fw={600}>
                    {item.count}
                  </Text>
                </Group>
              ))
            ) : (
              <Text size="xs" c="dimmed">
                No upcoming events.
              </Text>
            )}
          </ScrollArea.Autosize>
        </Paper>

        {/* Needs Approval */}
        <Paper withBorder p="lg">
          <Text size="xs" tt="uppercase" fw={700} c="dimmed">
            Needs Approval
          </Text>
          <Title order={3} mt="xs">
            {data.pendingApprovals.length}
          </Title>
        </Paper>
      </SimpleGrid>

      {/* Category filter toolbar */}
      <div style={{ overflowX: "auto" }}>
        <Group gap="xs" wrap="nowrap" mb="md">
          {categories.map((category) => (
            <Button
              key={category}
              radius="xl"
              size="xs"
              variant={activeCategory === category ? "filled" : "default"}
              aria-pressed={activeCategory === category}
              onClick={() => setActiveCategory(category)}
            >
              {category === "all" ? "All" : formatCategory(category)}
            </Button>
          ))}
        </Group>
      </div>

      <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="lg">
        <CalendarLiveBoard
          events={visibleEvents}
          churchTimeZone={session.appContext.church.timezone}
          canManageEvents={canManageEvents}
          canOpenEventWorkspace={canOpenEventWorkspace}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />

        <Stack gap="lg">
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
