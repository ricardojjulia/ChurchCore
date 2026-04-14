"use client";

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
import { FlameKindling, HeartHandshake, Home, UsersRound } from "lucide-react";

import { ApplicationShell } from "@/components/application/app-shell";
import { MemberBottomNav } from "@/components/application/member-bottom-nav";
import type { ChurchAppSession } from "@/lib/auth";
import type { MemberMinistriesData, MinistryType } from "@/lib/ministry-forge-types";

const MINISTRY_TYPE_LABELS: Record<string, string> = {
  outreach: "Outreach",
  discipleship: "Discipleship",
  worship: "Worship",
  care: "Care",
  administration: "Administration",
  youth: "Youth",
  children: "Children",
  missions: "Missions",
};

const ROLE_LABELS: Record<string, string> = {
  leader: "Leader",
  assistant_leader: "Asst. Leader",
  member: "Member",
};

const ROLE_COLOR: Record<string, string> = {
  leader: "churchBlue",
  assistant_leader: "blue",
  member: "gray",
};

export function MemberMinistriesWorkspace({
  session,
  data,
}: {
  session: ChurchAppSession;
  data: MemberMinistriesData;
}) {
  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/member"
      calendarHref="/app/calendar"
      sectionLabel="Member"
      title="My Ministries"
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
        {
          href: "/app/member/ministries",
          label: "Ministries",
          description: "My serving areas",
          icon: FlameKindling,
          active: true,
        },
      ]}
      bottomNav={<MemberBottomNav />}
    >
      <Stack gap="lg">
        {/* Enrolled ministries */}
        <div>
          <Title order={3} mb="md">
            My ministries
          </Title>

          {data.ministries.length ? (
            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
              {data.ministries.map((ministry) => (
                <Paper key={ministry.id} withBorder radius="xl" p="lg">
                  <Group justify="space-between" align="flex-start" gap="md">
                    <div style={{ flex: 1 }}>
                      <Group gap="xs" mb={4} wrap="wrap">
                        {ministry.ministryType ? (
                          <Badge variant="light" color="churchBlue" radius="sm" size="sm">
                            {MINISTRY_TYPE_LABELS[ministry.ministryType] ?? ministry.ministryType}
                          </Badge>
                        ) : null}
                        <Badge
                          variant="light"
                          color={ROLE_COLOR[ministry.role] ?? "gray"}
                          radius="sm"
                          size="sm"
                        >
                          {ROLE_LABELS[ministry.role] ?? ministry.role}
                        </Badge>
                      </Group>

                      <Text fw={600} size="sm">
                        {ministry.name}
                      </Text>

                      {ministry.visionStatement ? (
                        <Text size="xs" c="dimmed" mt={4} lineClamp={2}>
                          {ministry.visionStatement}
                        </Text>
                      ) : null}

                      <Group gap={4} mt="xs">
                        <ThemeIcon size="xs" variant="transparent" color="dimmed">
                          <UsersRound size={11} />
                        </ThemeIcon>
                        <Text size="xs" c="dimmed">
                          {ministry.memberCount}{" "}
                          {ministry.memberCount === 1 ? "member" : "members"}
                        </Text>
                      </Group>
                    </div>
                  </Group>
                </Paper>
              ))}
            </SimpleGrid>
          ) : (
            <Paper withBorder radius="xl" p="xl">
              <Text size="sm" c="dimmed">
                You have not been assigned to any ministries yet. Contact your church admin or
                pastor to get connected.
              </Text>
            </Paper>
          )}
        </div>

        {/* All church ministries */}
        {data.allChurchMinistries.length > 0 ? (
          <div>
            <Title order={4} mb="sm">
              All ministries at {session.appContext.church.name}
            </Title>
            <Paper withBorder radius="xl" p="lg">
              <Stack gap="sm">
                {data.allChurchMinistries.map((ministry) => (
                  <Group key={ministry.id} justify="space-between" align="center">
                    <Text size="sm">{ministry.name}</Text>
                    {ministry.ministryType ? (
                      <Badge variant="light" color="gray" radius="sm" size="xs">
                        {MINISTRY_TYPE_LABELS[ministry.ministryType as MinistryType] ??
                          ministry.ministryType}
                      </Badge>
                    ) : null}
                  </Group>
                ))}
              </Stack>
            </Paper>
          </div>
        ) : null}
      </Stack>
    </ApplicationShell>
  );
}
