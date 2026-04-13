"use client";

import Link from "next/link";
import { CalendarRange, HeartHandshake, Home, UsersRound } from "lucide-react";
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
import { MemberFamilyEdit } from "@/components/application/member-family-edit";
import type { ChurchAppSession } from "@/lib/auth";
import type { MemberPortalData } from "@/lib/member-portal-data";

export function MemberFamilyWorkspace({
  session,
  data,
}: {
  session: ChurchAppSession;
  data: MemberPortalData;
}) {
  const family = data.family;

  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/member"
      calendarHref="/app/calendar"
      sectionLabel="Member"
      title="Family"
      description={session.appContext.church.name}
      sidebarTitle="Household"
      sidebarDescription="Keep your family record current."
      navLabel="Member"
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
          active: true,
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
          <Button
            component={Link}
            href="/app/calendar"
            radius="xl"
            leftSection={<CalendarRange size={16} />}
          >
            Calendar
          </Button>
        </Group>
      }
    >
      <ChurchAppContextBanner session={session} />

      <Paper withBorder radius="xl" p="xl">
        <Group justify="space-between" align="flex-start" gap="md">
          <Box>
            <Group gap="sm" mb="sm">
              <ThemeIcon color="gray" variant="light" radius="xl" size="lg">
                <Home size={18} />
              </ThemeIcon>
              <Badge color="gray" variant="light">
                {family ? `${family.members.length} people` : "Not set"}
              </Badge>
            </Group>
            <Title order={2}>{family?.familyName ?? "No family record yet"}</Title>
            <Text size="sm" c="dimmed" mt="sm">
              Use one household record for address and shared contact context.
            </Text>
          </Box>
          <MemberFamilyEdit family={family} />
        </Group>
      </Paper>

      <Paper withBorder radius="xl" p="xl">
        <Stack gap="sm">
          <Title order={3} size="h4">
            Household details
          </Title>
          <Text size="sm" c="dimmed">
            {family?.address || "No household address on file."}
          </Text>
          <Text size="sm" c="dimmed">
            {family?.homePhone || "No household phone on file."}
          </Text>
        </Stack>
      </Paper>

      <Paper withBorder radius="xl" p="xl">
        <Group justify="space-between" align="center" mb="lg">
          <Title order={3} size="h4">
            People in household
          </Title>
          <Badge color="gray" variant="light">
            {family?.members.length ?? 0}
          </Badge>
        </Group>

        <Stack gap="sm">
          {family?.members.length ? (
            family.members.map((member) => (
              <Paper key={member.id} withBorder radius="xl" p="lg">
                <Text fw={600}>{member.fullName}</Text>
                <Text size="sm" c="dimmed" mt={4}>
                  {member.displayTitle || "Church family"}
                </Text>
              </Paper>
            ))
          ) : (
            <Text size="sm" c="dimmed">
              Create a family record to group household members under one church context.
            </Text>
          )}
        </Stack>
      </Paper>
    </ApplicationShell>
  );
}
