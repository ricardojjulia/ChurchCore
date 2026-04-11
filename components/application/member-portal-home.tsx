"use client";

import Link from "next/link";
import { CalendarRange, HeartHandshake, Mail, MapPin, Phone } from "lucide-react";
import {
  Badge,
  Box,
  Button,
  Group,
  Paper,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";

import { ApplicationShell } from "@/components/application/app-shell";
import { ChurchAppContextBanner } from "@/components/application/church-app-context-banner";
import type { ChurchAppSession } from "@/lib/auth";
import type { MemberPortalData } from "@/lib/member-portal-data";

function formatEventDate(value: string) {
  const date = new Date(value);

  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function MemberPortalHome({
  session,
  data,
}: {
  session: ChurchAppSession;
  data: MemberPortalData;
}) {
  const profile = data.profile;

  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/member"
      calendarHref="/app/calendar"
      sectionLabel="Member"
      title={profile?.fullName ?? session.profile.name}
      description={session.appContext.church.name}
      sidebarTitle="Member portal"
      sidebarDescription="Profile, ministries, and upcoming events."
      navLabel="Current role"
      navItems={[
        {
          href: "/app/member",
          label: "Portal",
          description: session.appContext.church.name,
          icon: HeartHandshake,
          active: true,
        },
      ]}
      topActions={
        <Group gap="sm" wrap="wrap" justify="flex-end">
          <Button component={Link} href="/app/calendar" radius="xl">
            Open calendar
          </Button>
        </Group>
      }
    >
      <ChurchAppContextBanner session={session} />

      <Stack gap="lg">
        <Paper withBorder radius="xl" p="xl">
          <Group justify="space-between" align="flex-start" gap="md">
            <Box>
              <Group gap="sm" mb="md">
                <ThemeIcon color="gray" variant="light" radius="xl" size="lg">
                  <HeartHandshake size={18} />
                </ThemeIcon>
                <Badge color="gray" variant="light">
                  {profile?.displayTitle || "Member"}
                </Badge>
              </Group>
              <Title order={2}>{profile?.fullName ?? session.profile.name}</Title>
              <Text c="dimmed" mt="sm">
                {session.appContext.church.name}
              </Text>
            </Box>

            <Stack gap="xs" align="flex-start">
              {profile?.email ? (
                <Group gap={8}>
                  <Mail size={14} />
                  <Text size="sm">{profile.email}</Text>
                </Group>
              ) : null}
              {profile?.phone ? (
                <Group gap={8}>
                  <Phone size={14} />
                  <Text size="sm">{profile.phone}</Text>
                </Group>
              ) : null}
              {profile?.address ? (
                <Group gap={8} align="flex-start">
                  <MapPin size={14} style={{ marginTop: 3 }} />
                  <Text size="sm">{profile.address}</Text>
                </Group>
              ) : null}
            </Stack>
          </Group>
        </Paper>

        <Paper withBorder radius="xl" p="xl">
          <Title order={3} size="h4">
            Ministries
          </Title>
          <Stack gap="sm" mt="lg">
            {data.ministries.length ? (
              data.ministries.map((ministry) => (
                <Paper key={ministry.id} withBorder radius="xl" p="lg">
                  <Text fw={600}>{ministry.name}</Text>
                  {ministry.description ? (
                    <Text c="dimmed" size="sm" mt={6}>
                      {ministry.description}
                    </Text>
                  ) : null}
                </Paper>
              ))
            ) : (
              <Text c="dimmed" size="sm">
                No ministry assignments yet.
              </Text>
            )}
          </Stack>
        </Paper>

        <Paper withBorder radius="xl" p="xl">
          <Group justify="space-between" align="center" mb="lg">
            <Title order={3} size="h4">
              Upcoming
            </Title>
            <Button
              component={Link}
              href="/app/calendar"
              variant="default"
              radius="xl"
              leftSection={<CalendarRange size={16} />}
            >
              Calendar
            </Button>
          </Group>

          <Stack gap="sm">
            {data.upcomingEvents.length ? (
              data.upcomingEvents.map((event) => (
                <Paper key={event.id} withBorder radius="xl" p="lg">
                  <Group justify="space-between" align="flex-start" gap="md">
                    <Box>
                      <Text fw={600}>{event.title}</Text>
                      <Text c="dimmed" size="sm" mt={6}>
                        {formatEventDate(event.startsAt)}
                      </Text>
                      {event.description ? (
                        <Text c="dimmed" size="sm" mt={6}>
                          {event.description}
                        </Text>
                      ) : null}
                    </Box>

                    <Stack gap={6} align="flex-end">
                      <Badge color="gray" variant="light">
                        {event.category}
                      </Badge>
                      {event.ministryName ? (
                        <Text size="sm" c="dimmed">
                          {event.ministryName}
                        </Text>
                      ) : null}
                    </Stack>
                  </Group>
                </Paper>
              ))
            ) : (
              <Text c="dimmed" size="sm">
                No upcoming events yet.
              </Text>
            )}
          </Stack>
        </Paper>
      </Stack>
    </ApplicationShell>
  );
}
