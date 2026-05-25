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
import { MemberBottomNav } from "@/components/application/member-bottom-nav";
import { MemberFamilyEdit } from "@/components/application/member-family-edit";
import { NotificationPreferencesForm } from "@/components/application/notification-preferences-form";
import { MemberProfileEdit } from "@/components/application/member-profile-edit";
import { useI18n } from "@/components/i18n-provider";
import type { ChurchAppSession } from "@/lib/auth";
import type { MemberPortalData } from "@/lib/member-portal-data";

function formatEventDate(value: string, locale: string) {
  const date = new Date(value);

  return new Intl.DateTimeFormat(locale === "es" ? "es-US" : "en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatShortDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale === "es" ? "es-US" : "en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function knownKey(value: string) {
  return value.toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
}

export function MemberPortalHome({
  session,
  data,
}: {
  session: ChurchAppSession;
  data: MemberPortalData;
}) {
  const profile = data.profile;
  const { locale, t } = useI18n();
  const translateMember = (
    key: string,
    values?: Record<string, string | number>,
  ) => t("member", key, values);
  const translateKnown = (value: string) => {
    const key = knownKey(value);
    const translated = translateMember(key);
    return translated === key ? value : translated;
  };

  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/member"
      calendarHref="/app/calendar"
      sectionLabel={translateMember("member")}
      title={profile?.fullName ?? session.profile.name}
      description={session.appContext.church.name}
      sidebarTitle={translateMember("memberPortal")}
      sidebarDescription={translateMember("memberPortalDescription")}
      navLabel={translateMember("currentRole")}
      navItems={[
        {
          href: "/app/member",
          label: translateMember("home"),
          description: translateMember("personalOverview"),
          icon: HeartHandshake,
          active: true,
        },
        {
          href: "/app/member/directory",
          label: translateMember("directory"),
          description: translateMember("churchFamily"),
          icon: UsersRound,
        },
        {
          href: "/app/member/family",
          label: translateMember("family"),
          description: translateMember("householdDetails"),
          icon: Home,
        },
      ]}
      bottomNav={<MemberBottomNav />}
    >
      <ChurchAppContextBanner session={session} />

      <Stack gap="lg">
        {profile && !profile.emergencyContactName ? (
          <Alert
            icon={<AlertCircle size={16} />}
            color="yellow"
            radius="xl"
            title={translateMember("profileIncomplete")}
          >
            {translateMember("profileIncompleteDescription")}{" "}
            <MemberProfileEdit profile={profile} />
          </Alert>
        ) : null}

        {profile && data.needsCommunicationPreferencesSetup ? (
          <Alert
            icon={<AlertCircle size={16} />}
            color="blue"
            radius="xl"
            title={translateMember("finishCommunicationPreferences")}
          >
            {translateMember("communicationPreferencesDescription")}
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
                  {profile?.displayTitle || translateMember("member")}
                </Badge>
              </Group>
              <Title order={2}>{profile?.fullName ?? session.profile.name}</Title>
              <Text c="dimmed" mt="sm">
                {session.appContext.church.name}
              </Text>
              {profile?.memberNumber ? (
                <Text size="sm" mt="sm">
                  {translateMember("memberNumber", { value: profile.memberNumber })}
                </Text>
              ) : null}
              {profile?.familyName ? (
                <Text size="sm" mt="sm">
                  {translateMember("familyLabel", { value: profile.familyName })}
                </Text>
              ) : null}
              {profile?.interests.length ? (
                <Group gap="xs" mt="md">
                  {profile.interests.slice(0, 4).map((interest) => (
                    <Badge key={interest} color="gray" variant="light">
                      {interest}
                    </Badge>
                  ))}
                </Group>
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

        {profile ? (
          <NotificationPreferencesForm
            profileId={profile.id}
            initial={
              data.notificationPreferences ?? {
                emailOptIn: true,
                smsOptIn: false,
                pushOptIn: true,
                inAppOptIn: true,
              }
            }
            isInitialSetup={data.needsCommunicationPreferencesSetup}
          />
        ) : null}

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
              {data.family?.familyName ?? translateMember("noFamilyRecord")}
            </Title>
            <Text size="sm" c="dimmed" mt="sm">
              {data.family?.address || translateMember("addHouseholdRecord")}
            </Text>
            <Group mt="lg">
              <MemberFamilyEdit family={data.family} />
              <Button
                component={Link}
                href="/app/member/family"
                variant="subtle"
                radius="xl"
              >
                {translateMember("open")}
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
              {translateMember("directory")}
            </Title>
            <Text size="sm" c="dimmed" mt="sm">
              {translateMember("directoryDescription")}
            </Text>
            <Button
              component={Link}
              href="/app/member/directory"
              variant="default"
              radius="xl"
              mt="lg"
            >
              {translateMember("openDirectory")}
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
              {translateMember("ministries")}
            </Title>
            <Text size="sm" c="dimmed" mt="sm">
              {data.ministries.length
                ? data.ministries.map((ministry) => ministry.name).join(", ")
                : translateMember("noMinistryAssignments")}
            </Text>
          </Paper>
        </SimpleGrid>

        <Paper withBorder radius="xl" p="xl">
          <Group justify="space-between" align="center" mb="lg">
            <Title order={3} size="h4">
              {translateMember("upcoming")}
            </Title>
            <Button
              component={Link}
              href="/app/calendar"
              variant="default"
              radius="xl"
              leftSection={<CalendarRange size={16} />}
            >
              {translateMember("calendar")}
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
                        {formatEventDate(event.startsAt, locale)}
                      </Text>
                      {event.description ? (
                        <Text c="dimmed" size="sm" mt={6}>
                          {event.description}
                        </Text>
                      ) : null}
                    </Box>

                    <Stack gap={6} align="flex-end">
                      <Badge color="gray" variant="light">
                        {translateKnown(event.category)}
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
                {translateMember("noUpcomingEvents")}
              </Text>
            )}
          </Stack>
        </Paper>

        <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="md">
          <Paper withBorder radius="xl" p="xl">
            <Group justify="space-between" align="center" mb="lg">
              <Title order={3} size="h4">
                {translateMember("myHistory")}
              </Title>
              <Badge color="gray" variant="light">
                {data.attendanceHistory.length}
              </Badge>
            </Group>

            <Stack gap="sm">
              {data.attendanceHistory.length ? (
                data.attendanceHistory.map((entry) => (
                  <Paper key={entry.id} withBorder radius="xl" p="lg">
                    <Group justify="space-between" align="flex-start" gap="md">
                      <Box>
                        <Text fw={600}>
                          {entry.eventTitle || translateMember("churchAttendance")}
                        </Text>
                        <Text c="dimmed" size="sm" mt={6}>
                          {formatEventDate(entry.checkedInAt, locale)}
                        </Text>
                      </Box>
                      <Stack gap={4} align="flex-end">
                        <Badge color="teal" variant="light">
                          {translateKnown(entry.status)}
                        </Badge>
                        <Text size="xs" c="dimmed">
                          {translateKnown(entry.checkInMethod)}
                        </Text>
                      </Stack>
                    </Group>
                  </Paper>
                ))
              ) : (
                <Text size="sm" c="dimmed">
                  {translateMember("noAttendanceHistory")}
                </Text>
              )}
            </Stack>
          </Paper>

          <Paper withBorder radius="xl" p="xl">
            <Group justify="space-between" align="center" mb="lg">
              <Title order={3} size="h4">
                {translateMember("upcomingServing")}
              </Title>
              <Badge color="gray" variant="light">
                {data.upcomingServing.length}
              </Badge>
            </Group>

            <Stack gap="sm">
              {data.upcomingServing.length ? (
                data.upcomingServing.map((assignment) => (
                  <Paper key={assignment.id} withBorder radius="xl" p="lg">
                    <Group justify="space-between" align="flex-start" gap="md">
                      <Box>
                        <Text fw={600}>{assignment.eventTitle}</Text>
                        <Text c="dimmed" size="sm" mt={6}>
                          {formatShortDate(assignment.startsAt, locale)} • {assignment.roleTitle}
                        </Text>
                      </Box>
                      <Badge color={assignment.isConfirmed ? "teal" : "yellow"} variant="light">
                        {assignment.isConfirmed
                          ? translateMember("confirmed")
                          : translateMember("pending")}
                      </Badge>
                    </Group>
                  </Paper>
                ))
              ) : (
                <Text size="sm" c="dimmed">
                  {translateMember("noServingAssignments")}
                </Text>
              )}
            </Stack>
          </Paper>
        </SimpleGrid>
      </Stack>
    </ApplicationShell>
  );
}
