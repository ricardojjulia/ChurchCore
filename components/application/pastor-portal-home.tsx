"use client";

import Link from "next/link";
import {
  BarChart2,
  BrainCircuit,
  HeartPulse,
  Phone,
  PhoneCall,
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
import type { ChurchAppSession } from "@/lib/auth";
import type { PastorPortalData } from "@/lib/pastor-portal-data";

function formatAttendance(value: string | null) {
  if (!value) {
    return "No attendance recorded";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function PastorPortalHome({
  session,
  data,
}: {
  session: ChurchAppSession;
  data: PastorPortalData;
}) {
  const profile = data.profile;

  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/pastor"
      calendarHref="/app/calendar"
      sectionLabel="Pastor"
      title={profile?.fullName ?? session.profile.name}
      description={session.appContext.church.name}
      sidebarTitle="Pastor portal"
      sidebarDescription="Leadership, follow-up, and ministry visibility."
      navLabel="Current role"
      navItems={[
        {
          href: "/app/pastor",
          label: "Home",
          description: "Pastor overview",
          icon: BrainCircuit,
          active: true,
        },
        {
          href: "/app/daily-desk",
          label: "Daily Desk",
          description: "Calls and follow-up",
          icon: PhoneCall,
        },
        {
          href: "/app/pastor/people",
          label: "People",
          description: "Directory and follow-up",
          icon: UsersRound,
        },
        {
          href: "/app/reports",
          label: "Reports",
          description: "Members, events, giving",
          icon: BarChart2,
        },
      ]}
    >
      <ChurchAppContextBanner session={session} />

      <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
        <Paper withBorder radius="xl" p="lg">
          <Text size="xs" tt="uppercase" fw={700} c="dimmed">
            People
          </Text>
          <Title order={3} mt="xs">
            {data.directorySummary.totalPeople}
          </Title>
          <Text size="sm" c="dimmed" mt="sm">
            Total church-scoped profiles visible to this workspace.
          </Text>
        </Paper>
        <Paper withBorder radius="xl" p="lg">
          <Text size="xs" tt="uppercase" fw={700} c="dimmed">
            Directory
          </Text>
          <Title order={3} mt="xs">
            {data.directorySummary.visibleInDirectory}
          </Title>
          <Text size="sm" c="dimmed" mt="sm">
            Profiles currently visible inside the member directory.
          </Text>
        </Paper>
        <Paper withBorder radius="xl" p="lg">
          <Text size="xs" tt="uppercase" fw={700} c="dimmed">
            Visitors
          </Text>
          <Title order={3} mt="xs">
            {data.directorySummary.visitorCount}
          </Title>
          <Text size="sm" c="dimmed" mt="sm">
            People marked for welcome and follow-up.
          </Text>
        </Paper>
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="lg">
        <Paper withBorder radius="xl" p="xl">
          <Group gap="sm" mb="md">
            <ThemeIcon color="gray" variant="light" radius="xl" size="lg">
              <BrainCircuit size={18} />
            </ThemeIcon>
            <Badge color="gray" variant="light">
              {profile?.displayTitle || "Pastor / Elder"}
            </Badge>
          </Group>

          <Title order={2}>{profile?.fullName ?? session.profile.name}</Title>
          <Text c="dimmed" mt="sm">
            {session.appContext.church.name}
          </Text>
          {profile?.email ? (
            <Text size="sm" mt="sm">
              {profile.email}
            </Text>
          ) : null}
          {profile?.phone ? (
            <Group gap={8} mt="xs">
              <Phone size={14} />
              <Text size="sm">{profile.phone}</Text>
            </Group>
          ) : null}
        </Paper>

        <Paper withBorder radius="xl" p="xl">
          <Group gap="sm" mb="md">
            <ThemeIcon color="gray" variant="light" radius="xl" size="lg">
              <UsersRound size={18} />
            </ThemeIcon>
            <Title order={3} size="h4">
              Led ministries
            </Title>
          </Group>

          <Stack gap="sm">
            {data.ledMinistries.length ? (
              data.ledMinistries.map((ministry) => (
                <Paper
                  key={ministry.id}
                  component={Link}
                  href={`/app/church-admin/ministry/${ministry.id}`}
                  withBorder
                  radius="xl"
                  p="md"
                  style={{ textDecoration: "none", display: "block", cursor: "pointer" }}
                >
                  <Group justify="space-between" align="center">
                    <div>
                      <Text fw={600}>{ministry.name}</Text>
                      <Text size="sm" c="dimmed" mt={4}>
                        Open Ministry Forge &rarr;
                      </Text>
                    </div>
                    <Badge color="gray" variant="light">
                      {ministry.memberCount}
                    </Badge>
                  </Group>
                </Paper>
              ))
            ) : (
              <Text size="sm" c="dimmed">
                No led ministries are connected to this pastor profile yet.
              </Text>
            )}
          </Stack>
        </Paper>
      </SimpleGrid>

      <Paper withBorder radius="xl" p="xl">
        <Group gap="sm" mb="lg">
          <ThemeIcon color="gray" variant="light" radius="xl" size="lg">
            <HeartPulse size={18} />
          </ThemeIcon>
          <div>
            <Title order={3} size="h4">
              Follow-up list
            </Title>
            <Text size="sm" c="dimmed">
              Visitors, inactive people, or profiles with no attendance history.
            </Text>
          </div>
        </Group>

        <Group justify="flex-end" mb="lg">
          <Button component={Link} href="/app/pastor/people" variant="default" radius="xl">
            Open people view
          </Button>
        </Group>

        <Stack gap="sm">
          {data.followUpPeople.length ? (
            data.followUpPeople.map((person) => (
              <Paper key={person.id} withBorder radius="xl" p="lg">
                <Group justify="space-between" align="flex-start" gap="md">
                  <div>
                    <Text fw={600}>{person.fullName}</Text>
                    <Text size="sm" c="dimmed" mt={4}>
                      {person.displayTitle || "Church member"}
                    </Text>
                    <Text size="sm" mt={8}>
                      Last attendance: {formatAttendance(person.lastAttendance)}
                    </Text>
                  </div>
                  <Badge color="gray" variant="light">
                    {person.membershipStatus}
                  </Badge>
                </Group>
              </Paper>
            ))
          ) : (
            <Text size="sm" c="dimmed">
              No follow-up items are currently surfaced from the people data.
            </Text>
          )}
        </Stack>
      </Paper>
    </ApplicationShell>
  );
}
