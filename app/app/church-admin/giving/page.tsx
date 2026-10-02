import { redirect } from "next/navigation";

import { GivingAdminWorkspace } from "@/components/application/giving-admin-workspace";
import { requireChurchSession } from "@/lib/auth";
import {
  getFundMappings,
  getGivingAnalyticsData,
  getGivingReadinessData,
} from "@/lib/donations-data";
import { getFinanceAccounts } from "@/lib/finance-data";
import { getChurchPaymentConnection } from "@/lib/stripe/connect";

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

  const [analytics, mappings, accounts, paymentConnection] = await Promise.all([
    getGivingAnalyticsData(session),
    getFundMappings(session),
    getFinanceAccounts(session),
    getChurchPaymentConnection(session.appContext.church.id),
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
      stripeResult={stripe ?? null}
    />
  );
}
