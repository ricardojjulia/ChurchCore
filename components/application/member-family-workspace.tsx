"use client";

import { HeartHandshake, Home, UsersRound } from "lucide-react";
import {
  Badge,
  Box,
  Group,
  Paper,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";

import { ApplicationShell } from "@/components/application/app-shell";
import { ChurchAppContextBanner } from "@/components/application/church-app-context-banner";
import { MemberBottomNav } from "@/components/application/member-bottom-nav";
import { MemberFamilyEdit } from "@/components/application/member-family-edit";
import { useI18n } from "@/components/i18n-provider";
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
  const { t } = useI18n();
  const translateMember = (
    key: string,
    values?: Record<string, string | number>,
  ) => t("member", key, values);
  const familyMemberCount = family?.members.length ?? 0;
  const familyMemberCountLabel =
    familyMemberCount === 1
      ? translateMember("personSingular")
      : translateMember("peoplePlural");

  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/member"
      calendarHref="/app/calendar"
      sectionLabel={translateMember("member")}
      title={translateMember("family")}
      description={session.appContext.church.name}
      sidebarTitle={translateMember("household")}
      sidebarDescription={translateMember("familySidebarDescription")}
      navLabel={translateMember("member")}
      navItems={[
        {
          href: "/app/member",
          label: translateMember("home"),
          description: translateMember("personalOverview"),
          icon: HeartHandshake,
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
          active: true,
        },
      ]}
      bottomNav={<MemberBottomNav />}
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
                {family
                  ? translateMember("peopleCount", {
                      count: familyMemberCount,
                      label: familyMemberCountLabel,
                    })
                  : translateMember("notSet")}
              </Badge>
            </Group>
            <Title order={2}>
              {family?.familyName ?? translateMember("noFamilyRecordYet")}
            </Title>
            <Text size="sm" c="dimmed" mt="sm">
              {translateMember("familyPageDescription")}
            </Text>
          </Box>
          <MemberFamilyEdit family={family} />
        </Group>
      </Paper>

      <Paper withBorder radius="xl" p="xl">
        <Stack gap="sm">
          <Title order={3} size="h4">
            {translateMember("householdDetails")}
          </Title>
          <Text size="sm" c="dimmed">
            {family?.address || translateMember("noHouseholdAddress")}
          </Text>
          <Text size="sm" c="dimmed">
            {family?.homePhone || translateMember("noHouseholdPhone")}
          </Text>
        </Stack>
      </Paper>

      <Paper withBorder radius="xl" p="xl">
        <Group justify="space-between" align="center" mb="lg">
          <Title order={3} size="h4">
            {translateMember("peopleInHousehold")}
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
                  {member.displayTitle || translateMember("churchFamily")}
                </Text>
              </Paper>
            ))
          ) : (
            <Text size="sm" c="dimmed">
              {translateMember("createFamilyRecordDescription")}
            </Text>
          )}
        </Stack>
      </Paper>
    </ApplicationShell>
  );
}
