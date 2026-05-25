import { redirect } from "next/navigation";

import { DataRightsPanel } from "@/components/portal/data-rights-panel";
import { ApplicationShell } from "@/components/application/app-shell";
import { MemberBottomNav } from "@/components/application/member-bottom-nav";
import { requireChurchSession } from "@/lib/auth";
import {
  createTenantServerClient,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";

async function fetchDataRightsStatus(profileId: string) {
  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{
      data_export_requested_at: string | null;
      data_delete_requested_at: string | null;
    }>(
      `select data_export_requested_at, data_delete_requested_at
       from public.profiles where id = $1`,
      [profileId],
    );
    return {
      exportRequestedAt: result.rows[0]?.data_export_requested_at ?? null,
      deleteRequestedAt: result.rows[0]?.data_delete_requested_at ?? null,
    };
  }

  const supabase = await createTenantServerClient();
  const { data } = await supabase
    .from("profiles")
    .select("data_export_requested_at, data_delete_requested_at")
    .eq("id", profileId)
    .single();

  return {
    exportRequestedAt:
      (data as { data_export_requested_at?: string } | null)
        ?.data_export_requested_at ?? null,
    deleteRequestedAt:
      (data as { data_delete_requested_at?: string } | null)
        ?.data_delete_requested_at ?? null,
  };
}

export default async function MemberDataRightsPage() {
  const session = await requireChurchSession("/app/member/data-rights");

  if (session.appContext.roleId !== "member") {
    redirect(session.homePath);
  }

  const { exportRequestedAt, deleteRequestedAt } = await fetchDataRightsStatus(
    session.profile.id,
  );

  const navItems = [
    {
      href: "/app/member",
      label: "Home",
      description: "Member overview",
      icon: "ShieldCheck",
    },
    {
      href: "/app/member/data-rights",
      label: "My Data",
      description: "Privacy & data rights",
      icon: "ShieldCheck",
      active: true,
    },
  ];

  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/member"
      calendarHref="/app/calendar"
      sectionLabel="Member"
      title="My Data & Privacy"
      description={session.appContext.church.name}
      sidebarTitle="Data Rights"
      sidebarDescription="Download your data or request account deletion at any time."
      navLabel="Member"
      navItems={navItems}
      bottomNav={<MemberBottomNav />}
    >
      <DataRightsPanel
        exportRequestedAt={exportRequestedAt}
        deleteRequestedAt={deleteRequestedAt}
      />
    </ApplicationShell>
  );
}
