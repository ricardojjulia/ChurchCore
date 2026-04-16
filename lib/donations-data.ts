import "server-only";

import {
  createTenantServerClient,
  hasTenantBackendEnv,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";
import type { ChurchAppSession } from "@/lib/auth";

export type DonationEntry = {
  id: string;
  amountCents: number;
  currency: string;
  fundDesignation: string | null;
  isRecurring: boolean;
  isAnonymous: boolean;
  status: "pending" | "succeeded" | "failed" | "refunded" | "cancelled";
  stripeSubscriptionId: string | null;
  note: string | null;
  receiptSentAt: string | null;
  createdAt: string;
  donorName: string | null;
  donorEmail: string | null;
};

export type GivingReportRow = {
  fundDesignation: string | null;
  totalCents: number;
  count: number;
  recurringCount: number;
};

export type DonorPortalData = {
  donations: DonationEntry[];
  totalGiven: number;
};

export type GivingDashboardData = {
  recentDonations: DonationEntry[];
  reportByFund: GivingReportRow[];
  totalThisMonth: number;
  totalAllTime: number;
  recurringCount: number;
};

const EMPTY_DONOR_PORTAL_DATA: DonorPortalData = {
  donations: [],
  totalGiven: 0,
};

const EMPTY_GIVING_DASHBOARD_DATA: GivingDashboardData = {
  recentDonations: [],
  reportByFund: [],
  totalThisMonth: 0,
  totalAllTime: 0,
  recurringCount: 0,
};

export async function getDonorPortalData(
  session: ChurchAppSession,
): Promise<DonorPortalData> {
  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    return EMPTY_DONOR_PORTAL_DATA;
  }

  const churchId = session.appContext.church.id;
  const profileId = session.profile.id;

  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{
      id: string;
      amount_cents: number;
      currency: string;
      fund_designation: string | null;
      is_recurring: boolean;
      is_anonymous: boolean;
      status: string;
      stripe_subscription_id: string | null;
      note: string | null;
      receipt_sent_at: string | null;
      created_at: string;
      donor_name: string | null;
      donor_email: string | null;
    }>(
      `select id, amount_cents, currency, fund_designation, is_recurring,
              is_anonymous, status, stripe_subscription_id, note,
              receipt_sent_at, created_at, donor_name, donor_email
       from public.donations
       where church_id = $1 and profile_id = $2 and is_anonymous = false
       order by created_at desc`,
      [churchId, profileId],
    );

    const donations = result.rows.map(mapDonationRow);
    return {
      donations,
      totalGiven: donations
        .filter((d) => d.status === "succeeded")
        .reduce((sum, d) => sum + d.amountCents, 0),
    };
  }

  const supabase = await createTenantServerClient();
  const { data } = await supabase
    .from("donations")
    .select("*")
    .eq("church_id", churchId)
    .eq("profile_id", profileId)
    .eq("is_anonymous", false)
    .order("created_at", { ascending: false });

  const donations = (data ?? []).map((r) => mapDonationRow(r as Parameters<typeof mapDonationRow>[0]));
  return {
    donations,
    totalGiven: donations
      .filter((d) => d.status === "succeeded")
      .reduce((sum, d) => sum + d.amountCents, 0),
  };
}

export async function getGivingDashboardData(
  session: ChurchAppSession,
): Promise<GivingDashboardData> {
  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    return EMPTY_GIVING_DASHBOARD_DATA;
  }

  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    const [recent, report, totals] = await Promise.all([
      queryTenantLocalDb<{
        id: string;
        amount_cents: number;
        currency: string;
        fund_designation: string | null;
        is_recurring: boolean;
        is_anonymous: boolean;
        status: string;
        stripe_subscription_id: string | null;
        note: string | null;
        receipt_sent_at: string | null;
        created_at: string;
        donor_name: string | null;
        donor_email: string | null;
      }>(
        `select id, amount_cents, currency, fund_designation, is_recurring,
                is_anonymous, status, stripe_subscription_id, note,
                receipt_sent_at, created_at, donor_name, donor_email
         from public.donations
         where church_id = $1 and status = 'succeeded'
         order by created_at desc
         limit 50`,
        [churchId],
      ),
      queryTenantLocalDb<{
        fund_designation: string | null;
        total_cents: number;
        cnt: number;
        recurring_cnt: number;
      }>(
        `select
           fund_designation,
           sum(amount_cents)::int                        as total_cents,
           count(*)::int                                 as cnt,
           count(*) filter (where is_recurring)::int     as recurring_cnt
         from public.donations
         where church_id = $1 and status = 'succeeded'
         group by fund_designation
         order by total_cents desc`,
        [churchId],
      ),
      queryTenantLocalDb<{
        total_all_time: number;
        total_this_month: number;
        recurring_count: number;
      }>(
        `select
           coalesce(sum(amount_cents), 0)::int  as total_all_time,
           coalesce(sum(amount_cents) filter (
             where created_at >= date_trunc('month', now())
           ), 0)::int                           as total_this_month,
           count(*) filter (where is_recurring and stripe_subscription_id is not null)::int
                                                as recurring_count
         from public.donations
         where church_id = $1 and status = 'succeeded'`,
        [churchId],
      ),
    ]);

    return {
      recentDonations: recent.rows.map(mapDonationRow),
      reportByFund: report.rows.map((r) => ({
        fundDesignation: r.fund_designation,
        totalCents: r.total_cents,
        count: r.cnt,
        recurringCount: r.recurring_cnt,
      })),
      totalThisMonth: totals.rows[0]?.total_this_month ?? 0,
      totalAllTime: totals.rows[0]?.total_all_time ?? 0,
      recurringCount: totals.rows[0]?.recurring_count ?? 0,
    };
  }

  const supabase = await createTenantServerClient();
  const { data: rows } = await supabase
    .from("donations")
    .select("*")
    .eq("church_id", churchId)
    .eq("status", "succeeded")
    .order("created_at", { ascending: false })
    .limit(50);

  const all = (rows ?? []).map((r) => mapDonationRow(r as Parameters<typeof mapDonationRow>[0]));
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const byFund = new Map<string, GivingReportRow>();
  let totalAll = 0;
  let totalMonth = 0;
  let recurringCount = 0;

  for (const d of all) {
    totalAll += d.amountCents;
    if (d.createdAt >= monthStart) totalMonth += d.amountCents;
    if (d.isRecurring && d.stripeSubscriptionId) recurringCount++;

    const key = d.fundDesignation ?? "General";
    const existing = byFund.get(key);
    if (existing) {
      existing.totalCents += d.amountCents;
      existing.count++;
      if (d.isRecurring) existing.recurringCount++;
    } else {
      byFund.set(key, {
        fundDesignation: d.fundDesignation,
        totalCents: d.amountCents,
        count: 1,
        recurringCount: d.isRecurring ? 1 : 0,
      });
    }
  }

  return {
    recentDonations: all,
    reportByFund: [...byFund.values()].sort((a, b) => b.totalCents - a.totalCents),
    totalThisMonth: totalMonth,
    totalAllTime: totalAll,
    recurringCount,
  };
}

// ── Shared mapper ────────────────────────────────────────────

function mapDonationRow(r: {
  id: string;
  amount_cents: number;
  currency: string;
  fund_designation: string | null;
  is_recurring: boolean;
  is_anonymous: boolean;
  status: string;
  stripe_subscription_id: string | null;
  note: string | null;
  receipt_sent_at: string | null;
  created_at: string;
  donor_name: string | null;
  donor_email: string | null;
}): DonationEntry {
  return {
    id: r.id,
    amountCents: r.amount_cents,
    currency: r.currency,
    fundDesignation: r.fund_designation,
    isRecurring: r.is_recurring,
    isAnonymous: r.is_anonymous,
    status: r.status as DonationEntry["status"],
    stripeSubscriptionId: r.stripe_subscription_id,
    note: r.note,
    receiptSentAt: r.receipt_sent_at,
    createdAt: r.created_at,
    donorName: r.donor_name,
    donorEmail: r.donor_email,
  };
}
