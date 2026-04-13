"use client";

import Link from "next/link";
import {
  AlertCircle,
  CalendarRange,
  HeartHandshake,
  Home,
  Mail,
  MapPin,
  Phone,
  UsersRound,
} from "lucide-react";
import {
  Alert,
  Badge,
  Box,
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
import { MemberFamilyEdit } from "@/components/application/member-family-edit";
import { MemberProfileEdit } from "@/components/application/member-profile-edit";
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
          label: "Home",
          description: "Personal overview",
          icon: HeartHandshake,
          active: true,
        },
        {
          href: "/app/member/directory",
          label: "Directory",
          description: "Church family",
          icon: UsersRound,
        },
        {
          href: "/app/member/family",
          label: "Family",
          description: "Household details",
          icon: Home,
        },
      ]}
      topActions={
        <Group gap="sm" wrap="wrap" justify="flex-end">
          <Button
            component={Link}
            href="/app/member/directory"
            variant="default"
            radius="xl"
          >
            Directory
          </Button>
          <Button component={Link} href="/app/calendar" radius="xl">
            Calendar
          </Button>
        </Group>
      }
    >
      <ChurchAppContextBanner session={session} />

      <Stack gap="lg">
        {profile && !profile.emergencyContactName ? (
          <Alert
            icon={<AlertCircle size={16} />}
            color="yellow"
            radius="xl"
            title="Profile incomplete"
          >
            Add an emergency contact so your church can reach someone on your
            behalf if needed.{" "}
            <MemberProfileEdit profile={profile} />
          </Alert>
        ) : null}

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
              {profile?.familyName ? (
                <Text size="sm" mt="sm">
                  Family: {profile.familyName}
                </Text>
              ) : null}
            </Box>

            <Stack gap="xs" align="flex-end">
              {profile ? <MemberProfileEdit profile={profile} /> : null}
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
            </Stack>
          </Group>
        </Paper>

        <SimpleGrid cols={{ base: 1, md: 2, xl: 3 }} spacing="md">
          <Paper withBorder radius="xl" p="xl">
            <Group justify="space-between" align="flex-start" mb="md">
              <ThemeIcon color="gray" variant="light" radius="xl" size="lg">
                <Home size={18} />
              </ThemeIcon>
              <Badge color="gray" variant="light">
                {data.family?.members.length ?? 0}
              </Badge>
            </Group>
            <Title order={3} size="h4">
              {data.family?.familyName ?? "No family record"}
            </Title>
            <Text size="sm" c="dimmed" mt="sm">
              {data.family?.address || "Add a household record for shared contact details."}
            </Text>
            <Group mt="lg">
              <MemberFamilyEdit family={data.family} />
              <Button
                component={Link}
                href="/app/member/family"
                variant="subtle"
                radius="xl"
              >
                Open
              </Button>
            </Group>
          </Paper>

          <Paper withBorder radius="xl" p="xl">
            <Group justify="space-between" align="flex-start" mb="md">
              <ThemeIcon color="gray" variant="light" radius="xl" size="lg">
                <UsersRound size={18} />
              </ThemeIcon>
              <Badge color="gray" variant="light">
                {data.directory.length}
              </Badge>
            </Group>
            <Title order={3} size="h4">
              Directory
            </Title>
            <Text size="sm" c="dimmed" mt="sm">
              Find people by name, family, or ministry.
            </Text>
            <Button
              component={Link}
              href="/app/member/directory"
              variant="default"
              radius="xl"
              mt="lg"
            >
              Open directory
            </Button>
          </Paper>

          <Paper withBorder radius="xl" p="xl">
            <Group justify="space-between" align="flex-start" mb="md">
              <ThemeIcon color="gray" variant="light" radius="xl" size="lg">
                <HeartHandshake size={18} />
              </ThemeIcon>
              <Badge color="gray" variant="light">
                {data.ministries.length}
              </Badge>
            </Group>
            <Title order={3} size="h4">
              Ministries
            </Title>
            <Text size="sm" c="dimmed" mt="sm">
              {data.ministries.length
                ? data.ministries.map((ministry) => ministry.name).join(", ")
                : "No ministry assignments yet."}
            </Text>
          </Paper>
        </SimpleGrid>

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
