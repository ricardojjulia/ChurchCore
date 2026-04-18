import { redirect } from "next/navigation";

import { ApplicationShell } from "@/components/application/app-shell";
import {
  FundMappingPanel,
  GivingAnalyticsPanel,
  GivingPageConfigPanel,
} from "@/components/application/giving-analytics";
import { requireChurchSession } from "@/lib/auth";
import { getFundMappings, getGivingAnalyticsData } from "@/lib/donations-data";
import { getFinanceAccounts } from "@/lib/finance-data";
import { Tabs } from "@mantine/core";
import { BarChart2, DollarSign, Link2, Settings } from "lucide-react";

const NAV_ITEMS = [
  {
    href: "/app/church-admin",
    label: "Home",
    description: "Church admin",
    icon: DollarSign,
  },
  {
    href: "/app/church-admin/giving",
    label: "Giving Admin",
    description: "Analytics & GL config",
    icon: BarChart2,
    active: true,
  },
  {
    href: "/app/giving",
    label: "Giving Dashboard",
    description: "Donation reports",
    icon: DollarSign,
  },
];

export default async function ChurchAdminGivingPage() {
  const session = await requireChurchSession("/app/church-admin/giving");

  if (session.appContext.roleId !== "church-admin") {
    redirect(session.homePath);
  }

  const [analytics, mappings, accounts] = await Promise.all([
    getGivingAnalyticsData(session),
    getFundMappings(session),
    getFinanceAccounts(session),
  ]);

  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/church-admin"
      calendarHref="/app/calendar"
      sectionLabel="Giving"
      title="Giving Administration"
      description={session.appContext.church.name}
      sidebarTitle="Giving Admin"
      sidebarDescription="Analytics, fund→GL mappings, and public giving page settings."
      navLabel="Church admin"
      navItems={NAV_ITEMS}
    >
      <Tabs defaultValue="analytics" p="md">
        <Tabs.List mb="md">
          <Tabs.Tab value="analytics" leftSection={<BarChart2 size={14} />}>
            Analytics
          </Tabs.Tab>
          <Tabs.Tab value="mappings" leftSection={<Link2 size={14} />}>
            Fund Mappings
          </Tabs.Tab>
          <Tabs.Tab value="givingpage" leftSection={<Settings size={14} />}>
            Giving Page
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="analytics">
          <GivingAnalyticsPanel analytics={analytics} />
        </Tabs.Panel>

        <Tabs.Panel value="mappings">
          <FundMappingPanel session={session} mappings={mappings} accounts={accounts} />
        </Tabs.Panel>

        <Tabs.Panel value="givingpage">
          <GivingPageConfigPanel session={session} />
        </Tabs.Panel>
      </Tabs>
    </ApplicationShell>
  );
}
