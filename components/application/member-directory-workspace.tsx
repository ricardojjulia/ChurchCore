"use client";

import { HeartHandshake, Home, UsersRound } from "lucide-react";

import { ApplicationShell } from "@/components/application/app-shell";
import { ChurchAppContextBanner } from "@/components/application/church-app-context-banner";
import { MemberBottomNav } from "@/components/application/member-bottom-nav";
import { MemberDirectoryPanel } from "@/components/application/member-directory-panel";
import { useI18n } from "@/components/i18n-provider";
import type { ChurchAppSession } from "@/lib/auth";
import type { MemberPortalData } from "@/lib/member-portal-data";

export function MemberDirectoryWorkspace({
  session,
  data,
}: {
  session: ChurchAppSession;
  data: MemberPortalData;
}) {
  const { t } = useI18n();
  const translateMember = (key: string) => t("member", key);

  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/member"
      calendarHref="/app/calendar"
      sectionLabel={translateMember("member")}
      title={translateMember("directory")}
      description={session.appContext.church.name}
      sidebarTitle={translateMember("churchDirectory")}
      sidebarDescription={translateMember("churchDirectoryDescription")}
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
          active: true,
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
      <MemberDirectoryPanel directory={data.directory} mode="full" />
    </ApplicationShell>
  );
}
