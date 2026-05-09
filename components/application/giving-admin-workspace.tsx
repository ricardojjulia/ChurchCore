"use client";

import { Tabs } from "@mantine/core";
import { BarChart2, DollarSign, Link2, Settings } from "lucide-react";

import { ApplicationShell } from "@/components/application/app-shell";
import {
  FundMappingPanel,
  GivingAnalyticsPanel,
  GivingPageConfigPanel,
  GivingReadinessPanel,
} from "@/components/application/giving-analytics";
import type { ChurchAppSession } from "@/lib/auth";
import type {
  FundMapping,
  GivingAnalyticsData,
  GivingReadinessData,
} from "@/lib/donations-data";
import type { FinanceAccount } from "@/lib/finance-types";

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

export function GivingAdminWorkspace({
  session,
  analytics,
  mappings,
  accounts,
  readiness,
}: {
  session: ChurchAppSession;
  analytics: GivingAnalyticsData;
  mappings: FundMapping[];
  accounts: FinanceAccount[];
  readiness: GivingReadinessData | null;
}) {
  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/church-admin"
      calendarHref="/app/calendar"
      sectionLabel="Giving"
      title="Giving Administration"
      description={session.appContext.church.name}
      sidebarTitle="Giving Admin"
      sidebarDescription="Analytics, fund->GL mappings, and public giving page settings."
      navLabel="Church admin"
      navItems={NAV_ITEMS}
    >
      <Tabs defaultValue={readiness ? "exceptions" : "analytics"} p="md">
        <Tabs.List mb="md">
          {readiness ? (
            <Tabs.Tab value="exceptions" leftSection={<Settings size={14} />}>
              Readiness Exceptions
            </Tabs.Tab>
          ) : null}
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

        {readiness ? (
          <Tabs.Panel value="exceptions">
            <GivingReadinessPanel readiness={readiness} />
          </Tabs.Panel>
        ) : null}

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
