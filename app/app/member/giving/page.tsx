import { redirect } from "next/navigation";

import { DonorPortal } from "@/components/portal/donor-portal";
import { ApplicationShell } from "@/components/application/app-shell";
import { MemberBottomNav } from "@/components/application/member-bottom-nav";
import { requireChurchSession } from "@/lib/auth";
import { getDonorPortalData } from "@/lib/donations-data";
import { Heart } from "lucide-react";

export default async function MemberGivingPage() {
  const session = await requireChurchSession("/app/member/giving");

  if (session.appContext.roleId !== "member") {
    redirect(session.homePath);
  }

  const data = await getDonorPortalData(session);

  const navItems = [
    {
      href: "/app/member",
      label: "Home",
      description: "Member overview",
      icon: Heart,
    },
    {
      href: "/app/member/giving",
      label: "Giving",
      description: "Your giving history",
      icon: Heart,
      active: true,
    },
  ];

  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/member"
      calendarHref="/app/calendar"
      sectionLabel="Member"
      title="My Giving"
      description={session.appContext.church.name}
      sidebarTitle="Giving"
      sidebarDescription="Your voluntary giving history and receipts. All giving is 100% your choice."
      navLabel="Member"
      navItems={navItems}
      bottomNav={<MemberBottomNav />}
    >
      <DonorPortal data={data} />
    </ApplicationShell>
  );
}
