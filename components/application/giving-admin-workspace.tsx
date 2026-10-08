"use client";

import Link from "next/link";
import { Button, Tabs } from "@mantine/core";
import { BarChart2, DollarSign, FileText, Link2, RefreshCw, Settings } from "lucide-react";

import { GivingStatementsPanel } from "@/components/application/giving-statements-panel";
import { RecurringGiftsAdminPanel } from "@/components/application/recurring-gifts-admin-panel";
import { StripeConnectCard } from "@/components/application/stripe-connect-card";
import { ApplicationShell } from "@/components/application/app-shell";
import {
  FundMappingPanel,
  GivingAnalyticsPanel,
  GivingPageConfigPanel,
  GivingReadinessPanel,
} from "@/components/application/giving-analytics";
import { useI18n } from "@/components/i18n-provider";
import type { ChurchAppSession } from "@/lib/auth";
import type {
  FundMapping,
  GivingAnalyticsData,
  GivingReadinessData,
} from "@/lib/donations-data";
import type { FinanceAccount } from "@/lib/finance-types";
import type { RecurringGift } from "@/lib/recurring-gifts";
import type { ChurchPaymentConnection } from "@/lib/stripe/connect";

export function GivingAdminWorkspace({
  session,
  analytics,
  mappings,
  accounts,
  readiness,
  paymentConnection = null,
  stripeResult = null,
  recurringGifts = [],
}: {
  session: ChurchAppSession;
  analytics: GivingAnalyticsData;
  mappings: FundMapping[];
  accounts: FinanceAccount[];
  readiness: GivingReadinessData | null;
  /** The church's Stripe Connect status (G3.0b). */
  paymentConnection?: ChurchPaymentConnection | null;
  /** `?stripe=` from the connect flow. */
  stripeResult?: string | null;
  /** The church's recurring gifts (G3.1). */
  recurringGifts?: RecurringGift[];
}) {
  const { t } = useI18n();

  const NAV_ITEMS = [
    {
      href: "/app/church-admin",
      label: "Home",
      description: "Church admin",
      icon: DollarSign,
    },
    {
      href: "/app/church-admin/giving",
      label: t("givingAdmin", "pageTitle"),
      description: t("givingAdmin", "sidebarDescription"),
      icon: BarChart2,
      active: true,
    },
    {
      href: "/app/giving",
      label: t("givingAdmin", "dashPageTitle"),
      description: "Donation reports",
      icon: DollarSign,
    },
  ];

  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/church-admin"
      calendarHref="/app/calendar"
      sectionLabel={t("givingAdmin", "sectionLabel")}
      title={t("givingAdmin", "pageTitle")}
      description={session.appContext.church.name}
      sidebarTitle={t("givingAdmin", "sidebarTitle")}
      sidebarDescription={t("givingAdmin", "sidebarDescription")}
      navLabel="Church admin"
      navItems={NAV_ITEMS}
      topActions={
        session.appContext.roleId === "church-admin" ? (
          <Button component={Link} href="/app/church-admin/giving/import" variant="default" radius="xl">
            Import
          </Button>
        ) : null
      }
    >
      {paymentConnection ? <StripeConnectCard connection={paymentConnection} result={stripeResult} /> : null}
      <Tabs defaultValue={readiness ? "exceptions" : "analytics"} p="md">
        <Tabs.List mb="md">
          {readiness ? (
            <Tabs.Tab value="exceptions" leftSection={<Settings size={14} />}>
              {t("givingAdmin", "tabReadinessExceptions")}
            </Tabs.Tab>
          ) : null}
          <Tabs.Tab value="analytics" leftSection={<BarChart2 size={14} />}>
            {t("givingAdmin", "tabAnalytics")}
          </Tabs.Tab>
          <Tabs.Tab value="recurring" leftSection={<RefreshCw size={14} />}>
            {t("givingAdmin", "tabRecurring")}
          </Tabs.Tab>
          <Tabs.Tab value="statements" leftSection={<FileText size={14} />}>
            {t("givingAdmin", "tabStatements")}
          </Tabs.Tab>
          <Tabs.Tab value="mappings" leftSection={<Link2 size={14} />}>
            {t("givingAdmin", "tabFundMappings")}
          </Tabs.Tab>
          <Tabs.Tab value="givingpage" leftSection={<Settings size={14} />}>
            {t("givingAdmin", "tabGivingPage")}
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

        <Tabs.Panel value="recurring">
          <RecurringGiftsAdminPanel gifts={recurringGifts} timeZone={session.appContext.church.timezone ?? null} />
        </Tabs.Panel>

        <Tabs.Panel value="statements">
          <GivingStatementsPanel />
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
