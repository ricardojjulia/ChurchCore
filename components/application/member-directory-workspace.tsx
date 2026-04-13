"use client";

import Link from "next/link";
import { CalendarRange, HeartHandshake, Home, UsersRound } from "lucide-react";
import { Button, Group } from "@mantine/core";

import { ApplicationShell } from "@/components/application/app-shell";
import { ChurchAppContextBanner } from "@/components/application/church-app-context-banner";
import { MemberDirectoryPanel } from "@/components/application/member-directory-panel";
import type { ChurchAppSession } from "@/lib/auth";
import type { MemberPortalData } from "@/lib/member-portal-data";

export function MemberDirectoryWorkspace({
  session,
  data,
}: {
  session: ChurchAppSession;
  data: MemberPortalData;
}) {
  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/member"
      calendarHref="/app/calendar"
      sectionLabel="Member"
      title="Directory"
      description={session.appContext.church.name}
      sidebarTitle="Church directory"
      sidebarDescription="Search people and family context."
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
          active: true,
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
            href="/app/member/family"
            variant="default"
            radius="xl"
          >
            Family
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
      <MemberDirectoryPanel directory={data.directory} mode="full" />
    </ApplicationShell>
  );
}
