import { redirect } from "next/navigation";

import { GivingAdminWorkspace } from "@/components/application/giving-admin-workspace";
import { requireChurchSession } from "@/lib/auth";
import {
  getFundMappings,
  getGivingAnalyticsData,
  getGivingReadinessData,
} from "@/lib/donations-data";
import { getFinanceAccounts } from "@/lib/finance-data";
import { listChurchRecurringGifts } from "@/lib/recurring-gifts";
import { getChurchPaymentConnection } from "@/lib/stripe/connect";
import { createTenantAdminClient } from "@/lib/supabase/tenant";

export default async function ChurchAdminGivingPage({
  searchParams = Promise.resolve({}),
}: {
  searchParams?: Promise<{ view?: string; stripe?: string }>;
} = {}) {
  const session = await requireChurchSession("/app/church-admin/giving");

  if (session.appContext.roleId !== "church-admin") {
    redirect(session.homePath);
  }

  const { view, stripe } = await searchParams;
  const readinessView = view === "exceptions";

  const [analytics, mappings, accounts, paymentConnection, recurringGifts] = await Promise.all([
    getGivingAnalyticsData(session),
    getFundMappings(session),
    getFinanceAccounts(session),
    getChurchPaymentConnection(session.appContext.church.id),
    listChurchRecurringGifts(createTenantAdminClient(), session.appContext.church.id),
  ]);
  const readiness = readinessView ? await getGivingReadinessData(session) : null;

  return (
    <GivingAdminWorkspace
      session={session}
      analytics={analytics}
      mappings={mappings}
      accounts={accounts}
      readiness={readiness}
      paymentConnection={paymentConnection}
      recurringGifts={recurringGifts}
      stripeResult={stripe ?? null}
    />
  );
}
