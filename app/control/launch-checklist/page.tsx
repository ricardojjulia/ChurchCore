import type { Metadata } from "next";

import { LaunchChecklist } from "@/components/application/launch-checklist";
import { ApplicationShell } from "@/components/application/app-shell";
import { requireControlPlaneSession } from "@/lib/auth";
import { Building2, CheckSquare, LifeBuoy, Wallet } from "lucide-react";

export const metadata: Metadata = {
  title: "Launch Checklist | ChurchCore Ops Control",
  description: "Pre-launch readiness checklist for ChurchCore Ops platform operators.",
};

export default async function LaunchChecklistPage() {
  const session = await requireControlPlaneSession("/control");

  const navItems = [
    { href: "/control", label: "Overview", description: "Platform overview", icon: Building2 },
    { href: "/control/tenants", label: "Tenants", description: "Church tenants", icon: Building2 },
    { href: "/control/billing", label: "Billing", description: "Platform billing", icon: Wallet },
    { href: "/control/support", label: "Support", description: "Support queue", icon: LifeBuoy },
    {
      href: "/control/launch-checklist",
      label: "Launch Checklist",
      description: "Pre-launch verification",
      icon: CheckSquare,
      active: true,
    },
  ];

  return (
    <ApplicationShell
      session={session}
      workspaceHref="/control"
      calendarHref="/app/calendar"
      sectionLabel="Control"
      title="Launch Checklist"
      description="ChurchCore Ops Platform"
      sidebarTitle="Control"
      sidebarDescription="Platform operator tools for ChurchCore Ops staff."
      navLabel="Control Plane"
      navItems={navItems}
    >
      <LaunchChecklist />
    </ApplicationShell>
  );
}
