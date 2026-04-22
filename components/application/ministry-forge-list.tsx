"use client";

import Link from "next/link";
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
import {
  BookOpen,
  Briefcase,
  FlameKindling,
  Globe,
  GraduationCap,
  Heart,
  Music,
  Settings,
  Users,
} from "lucide-react";

import { ApplicationShell } from "@/components/application/app-shell";
import type { ChurchAppSession } from "@/lib/auth";
import {
  hasTrackPanel,
  healthBand,
  type MinistryForgeEntry,
  type MinistryForgeListData,
  type MinistryType,
} from "@/lib/ministry-forge-types";

const TYPE_META: Record<
  MinistryType,
  { label: string; color: string; icon: React.ReactNode }
> = {
  worship:        { label: "Worship",       color: "violet",  icon: <Music size={13} /> },
  men:            { label: "Men's",          color: "blue",    icon: <Users size={13} /> },
  women:          { label: "Women's",        color: "pink",    icon: <Heart size={13} /> },
  marriage:       { label: "Marriage",       color: "rose",    icon: <Heart size={13} /> },
  missions:       { label: "Missions",       color: "teal",    icon: <Globe size={13} /> },
  outreach:       { label: "Outreach",       color: "orange",  icon: <FlameKindling size={13} /> },
  discipleship:   { label: "Discipleship",   color: "indigo",  icon: <BookOpen size={13} /> },
  care:           { label: "Care",           color: "pink",    icon: <Heart size={13} /> },
  administration: { label: "Admin",          color: "gray",    icon: <Settings size={13} /> },
  youth:          { label: "Youth",          color: "lime",    icon: <GraduationCap size={13} /> },
  children:       { label: "Children's",     color: "yellow",  icon: <Users size={13} /> },
  young_adult:    { label: "Young Adults",   color: "teal",    icon: <Briefcase size={13} /> },
  education:      { label: "Education",      color: "indigo",  icon: <BookOpen size={13} /> },
};

const HEALTH_COLOR: Record<string, string> = {
  green: "teal",
  yellow: "yellow",
  red: "red",
};

function MinistryCard({ ministry }: { ministry: MinistryForgeEntry }) {
  const typeMeta = ministry.ministryType ? TYPE_META[ministry.ministryType] : null;
  const band = healthBand(ministry.healthScore);

  return (
    <Paper
      component={Link}
      href={`/app/church-admin/ministry/${ministry.id}`}
      withBorder
      radius="xl"
      p="lg"
      style={{ textDecoration: "none", cursor: "pointer" }}
    >
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <div style={{ flex: 1, minWidth: 0 }}>
            <Text fw={700} size="md" truncate>
              {ministry.name}
            </Text>
            {ministry.visionStatement ? (
              <Text size="xs" c="dimmed" mt={2} lineClamp={2}>
                {ministry.visionStatement}
              </Text>
            ) : null}
          </div>
          {typeMeta ? (
            <Badge
              color={typeMeta.color}
              variant="light"
              size="sm"
              radius="sm"
              leftSection={typeMeta.icon}
              style={{ flexShrink: 0 }}
            >
              {typeMeta.label}
            </Badge>
          ) : null}
        </Group>

        <Group gap="xs" mt={2}>
          <Badge color={HEALTH_COLOR[band] ?? "gray"} variant="dot" size="sm">
            Health {ministry.healthScore.toFixed(1)}
          </Badge>
          <Badge color="churchBlue" variant="light" size="sm">
            {ministry.memberCount} member{ministry.memberCount !== 1 ? "s" : ""}
          </Badge>
          {hasTrackPanel(ministry.ministryType) ? (
            <Badge color="violet" variant="outline" size="sm">
              Track panel
            </Badge>
          ) : null}
        </Group>
        {ministry.leaderName ? (
          <Text size="xs" c="dimmed">
            Leader: {ministry.leaderName}
          </Text>
        ) : null}
      </Stack>
    </Paper>
  );
}

export function MinistryForgeListPage({
  session,
  data,
}: {
  session: ChurchAppSession;
  data: MinistryForgeListData;
}) {
  const isManager = session.appContext.roleId === "church-admin";

  const navItems = isManager
    ? [
        { href: "/app/church-admin",        label: "Home",    description: "Admin overview",   icon: Settings },
        { href: "/app/church-admin/people", label: "People",  description: "Manage members",   icon: Users },
        { href: "/app/church-admin/ministry", label: "Ministry Forge", description: "All ministries", icon: FlameKindling },
      ]
    : [
        { href: "/app/pastor",              label: "Home",    description: "Pastor overview",  icon: FlameKindling },
        { href: "/app/church-admin/ministry", label: "Ministry Forge", description: "All ministries", icon: FlameKindling },
      ];

  const avgHealth =
    data.ministries.length > 0
      ? data.ministries.reduce((s, m) => s + m.healthScore, 0) / data.ministries.length
      : 0;

  const totalMembers = data.ministries.reduce((s, m) => s + m.memberCount, 0);

  return (
    <ApplicationShell
      session={session}
      workspaceHref={isManager ? "/app/church-admin" : "/app/pastor"}
      calendarHref="/app/calendar"
      sectionLabel="Ministry Forge"
      title="Ministry Forge"
      description={session.appContext.church?.name ?? "Your Church"}
      sidebarTitle="Ministry Forge"
      sidebarDescription="Manage and monitor all ministries."
      navLabel="Navigation"
      navItems={navItems}
    >
      <Stack gap="xl">
        {/* Summary strip */}
        {data.ministries.length > 0 ? (
          <Group gap="md">
            <Paper withBorder radius="lg" p="md" ta="center" style={{ minWidth: 110 }}>
              <Text size="xs" tt="uppercase" fw={700} c="dimmed">Ministries</Text>
              <Title order={3} mt={4}>{data.ministries.length}</Title>
            </Paper>
            <Paper withBorder radius="lg" p="md" ta="center" style={{ minWidth: 130 }}>
              <Text size="xs" tt="uppercase" fw={700} c="dimmed">Members Serving</Text>
              <Title order={3} mt={4}>{totalMembers}</Title>
            </Paper>
            <Paper withBorder radius="lg" p="md" ta="center" style={{ minWidth: 120 }}>
              <Text size="xs" tt="uppercase" fw={700} c="dimmed">Avg Health</Text>
              <Title order={3} mt={4}>{avgHealth.toFixed(1)}</Title>
            </Paper>
          </Group>
        ) : null}

        {/* Ministry grid */}
        {data.ministries.length === 0 ? (
          <Paper withBorder radius="xl" p="xl" ta="center">
            <ThemeIcon variant="light" color="churchBlue" size="xl" radius="xl" mx="auto">
              <FlameKindling size={24} />
            </ThemeIcon>
            <Title order={4} mt="md">No ministries yet</Title>
            <Text size="sm" c="dimmed" mt="xs">
              Ministries will appear here once they are added to your church.
            </Text>
          </Paper>
        ) : (
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
            {data.ministries.map((m) => (
              <MinistryCard key={m.id} ministry={m} />
            ))}
          </SimpleGrid>
        )}
      </Stack>
    </ApplicationShell>
  );
}
