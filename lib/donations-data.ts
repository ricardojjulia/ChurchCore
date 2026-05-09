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

// ── Analytics types ──────────────────────────────────────────

export type GivingMonthlyTrend = {
  month: string; // "YYYY-MM"
  totalCents: number;
  donorCount: number;
  newDonorCount: number;
};

export type GivingAnalyticsData = {
  monthlyTrend: GivingMonthlyTrend[];
  retentionRate: number; // 0-100
  activeDonors: number;
  lapsedDonors: number;
  newDonorsThisMonth: number;
  avgGiftCents: number;
};

export type GivingReadinessData = {
  failedDonations: DonationEntry[];
  unpostedDonations: DonationEntry[];
  unsentReceipts: DonationEntry[];
  draftJournalCount: number;
  liveGivingPageCount: number;
};

const EMPTY_ANALYTICS: GivingAnalyticsData = {
  monthlyTrend: [],
  retentionRate: 0,
  activeDonors: 0,
  lapsedDonors: 0,
  newDonorsThisMonth: 0,
  avgGiftCents: 0,
};

const EMPTY_READINESS: GivingReadinessData = {
  failedDonations: [],
  unpostedDonations: [],
  unsentReceipts: [],
  draftJournalCount: 0,
  liveGivingPageCount: 0,
};

export async function getGivingAnalyticsData(
  session: ChurchAppSession,
): Promise<GivingAnalyticsData> {
  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    return EMPTY_ANALYTICS;
  }

  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    const [trendResult, retentionResult, lapsedResult] = await Promise.all([
      queryTenantLocalDb<{
        month: string;
        total_cents: number;
        donor_count: number;
        new_donor_count: number;
      }>(
        `with first_gifts as (
           select donor_email, min(date_trunc('month', created_at)) as first_month
           from public.donations
           where church_id = $1 and status = 'succeeded' and donor_email is not null
           group by donor_email
         ),
         monthly as (
           select
             to_char(date_trunc('month', d.created_at), 'YYYY-MM') as month,
             sum(d.amount_cents)::int as total_cents,
             count(distinct d.donor_email) filter (where d.donor_email is not null)::int as donor_count,
             count(distinct d.donor_email) filter (
               where d.donor_email is not null
               and date_trunc('month', d.created_at) = fg.first_month
             )::int as new_donor_count
           from public.donations d
           left join first_gifts fg on fg.donor_email = d.donor_email
           where d.church_id = $1 and d.status = 'succeeded'
             and d.created_at >= now() - interval '12 months'
           group by 1
         )
         select * from monthly order by month`,
        [churchId],
      ),
      queryTenantLocalDb<{
        donors_last_30: number;
        donors_prior_30: number;
        retained: number;
      }>(
        `with last_30 as (
           select distinct donor_email from public.donations
           where church_id = $1 and status = 'succeeded'
             and donor_email is not null
             and created_at >= now() - interval '30 days'
         ),
         prior_30 as (
           select distinct donor_email from public.donations
           where church_id = $1 and status = 'succeeded'
             and donor_email is not null
             and created_at >= now() - interval '60 days'
             and created_at < now() - interval '30 days'
         )
         select
           (select count(*) from last_30)::int  as donors_last_30,
           (select count(*) from prior_30)::int  as donors_prior_30,
           (select count(*) from last_30 l join prior_30 p on p.donor_email = l.donor_email)::int as retained`,
        [churchId],
      ),
      queryTenantLocalDb<{
        lapsed: number;
        active: number;
        avg_cents: number;
      }>(
        `with latest as (
           select donor_email, max(created_at) as last_given
           from public.donations
           where church_id = $1 and status = 'succeeded' and donor_email is not null
           group by donor_email
         ),
         stats as (
           select
             count(*) filter (where last_given < now() - interval '90 days')::int as lapsed,
             count(*) filter (where last_given >= now() - interval '90 days')::int as active
           from latest
         ),
         avg_gift as (
           select coalesce(avg(amount_cents)::int, 0) as avg_cents
           from public.donations
           where church_id = $1 and status = 'succeeded'
             and created_at >= now() - interval '12 months'
         )
         select s.lapsed, s.active, a.avg_cents from stats s, avg_gift a`,
        [churchId],
      ),
    ]);

    const trend = trendResult.rows;
    const ret = retentionResult.rows[0];
    const lapsed = lapsedResult.rows[0];
    const currentMonth = new Date().toISOString().slice(0, 7);
    const thisMonthRow = trend.find((r) => r.month === currentMonth);

    return {
      monthlyTrend: trend.map((r) => ({
        month: r.month,
        totalCents: r.total_cents,
        donorCount: r.donor_count,
        newDonorCount: r.new_donor_count,
      })),
      retentionRate: ret && ret.donors_prior_30 > 0
        ? Math.round((ret.retained / ret.donors_prior_30) * 100)
        : 0,
      activeDonors: lapsed?.active ?? 0,
      lapsedDonors: lapsed?.lapsed ?? 0,
      newDonorsThisMonth: thisMonthRow?.new_donor_count ?? 0,
      avgGiftCents: lapsed?.avg_cents ?? 0,
    };
  }

  // Supabase path — compute from the recent donations we already have
  const supabase = await createTenantServerClient();
  const { data: allRows } = await supabase
    .from("donations")
    .select("id, amount_cents, fund_designation, donor_email, created_at, status")
    .eq("church_id", churchId)
    .eq("status", "succeeded")
    .gte("created_at", new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString());

  const rows = allRows ?? [];
  const now = Date.now();
  const monthMap = new Map<string, { totalCents: number; donors: Set<string> }>();
  const firstGift = new Map<string, string>(); // donor_email → first month
  const latestGift = new Map<string, number>(); // donor_email → timestamp

  for (const r of rows) {
    const month = r.created_at.slice(0, 7);
    if (!monthMap.has(month)) monthMap.set(month, { totalCents: 0, donors: new Set() });
    const m = monthMap.get(month)!;
    m.totalCents += r.amount_cents;
    if (r.donor_email) {
      m.donors.add(r.donor_email);
      const fg = firstGift.get(r.donor_email);
      if (!fg || month < fg) firstGift.set(r.donor_email, month);
      const ts = new Date(r.created_at).getTime();
      if (!latestGift.has(r.donor_email) || ts > latestGift.get(r.donor_email)!) {
        latestGift.set(r.donor_email, ts);
      }
    }
  }

  const monthlyTrend: GivingMonthlyTrend[] = [...monthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, m]) => ({
      month,
      totalCents: m.totalCents,
      donorCount: m.donors.size,
      newDonorCount: [...m.donors].filter((e) => firstGift.get(e) === month).length,
    }));

  const lapsedMs = 90 * 24 * 60 * 60 * 1000;
  const thirtyMs = 30 * 24 * 60 * 60 * 1000;
  let active = 0, lapsedCount = 0;
  const last30 = new Set<string>(), prior30 = new Set<string>();
  for (const [email, ts] of latestGift) {
    const age = now - ts;
    if (age < lapsedMs) active++; else lapsedCount++;
    if (age < thirtyMs) last30.add(email);
    else if (age < 2 * thirtyMs) prior30.add(email);
  }
  const retained = [...last30].filter((e) => prior30.has(e)).length;
  const currentMonth = new Date().toISOString().slice(0, 7);
  const thisMonthRow = monthlyTrend.find((r) => r.month === currentMonth);
  const avgGiftCents = rows.length > 0 ? Math.round(rows.reduce((s, r) => s + r.amount_cents, 0) / rows.length) : 0;

  return {
    monthlyTrend,
    retentionRate: prior30.size > 0 ? Math.round((retained / prior30.size) * 100) : 0,
    activeDonors: active,
    lapsedDonors: lapsedCount,
    newDonorsThisMonth: thisMonthRow?.newDonorCount ?? 0,
    avgGiftCents,
  };
}

export async function getGivingReadinessData(
  session: ChurchAppSession,
): Promise<GivingReadinessData> {
  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    return EMPTY_READINESS;
  }

  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    const [donationsResult, glPostsResult, journalsResult, givingPagesResult] = await Promise.all([
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
         where church_id = $1
           and (
             status = 'failed'
             or (status = 'succeeded' and receipt_sent_at is null)
           )
         order by created_at desc
         limit 50`,
        [churchId],
      ),
      queryTenantLocalDb<{ donation_id: string }>(
        `select donation_id
         from public.donation_gl_posts
         where church_id = $1 and status = 'posted'`,
        [churchId],
      ),
      queryTenantLocalDb<{ count: number }>(
        `select count(*)::int from public.finance_journals where church_id = $1 and status = 'draft'`,
        [churchId],
      ),
      queryTenantLocalDb<{ count: number }>(
        `select count(*)::int from public.public_giving_pages where church_id = $1 and is_live`,
        [churchId],
      ),
    ]);

    const donations = donationsResult.rows.map(mapDonationRow);
    const postedDonationIds = new Set(glPostsResult.rows.map((row) => row.donation_id));

    return {
      failedDonations: donations.filter((donation) => donation.status === "failed"),
      unpostedDonations: donations.filter(
        (donation) =>
          donation.status === "succeeded" &&
          !postedDonationIds.has(donation.id),
      ),
      unsentReceipts: donations.filter(
        (donation) => donation.status === "succeeded" && !donation.receiptSentAt,
      ),
      draftJournalCount: journalsResult.rows[0]?.count ?? 0,
      liveGivingPageCount: givingPagesResult.rows[0]?.count ?? 0,
    };
  }

  const supabase = await createTenantServerClient();
  const [donationsResult, glPostsResult, journalsResult, givingPagesResult] = await Promise.all([
    supabase
      .from("donations")
      .select("*")
      .eq("church_id", churchId)
      .or("status.eq.failed,and(status.eq.succeeded,receipt_sent_at.is.null)")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("donation_gl_posts")
      .select("donation_id")
      .eq("church_id", churchId)
      .eq("status", "posted"),
    supabase
      .from("finance_journals")
      .select("id")
      .eq("church_id", churchId)
      .eq("status", "draft"),
    supabase
      .from("public_giving_pages")
      .select("id")
      .eq("church_id", churchId)
      .eq("is_live", true),
  ]);

  const donations =
    donationsResult.data?.map((row) => mapDonationRow(row as Parameters<typeof mapDonationRow>[0])) ?? [];
  const postedDonationIds = new Set((glPostsResult.data ?? []).map((row) => row.donation_id));

  return {
    failedDonations: donations.filter((donation) => donation.status === "failed"),
    unpostedDonations: donations.filter(
      (donation) =>
        donation.status === "succeeded" &&
        !postedDonationIds.has(donation.id),
    ),
    unsentReceipts: donations.filter(
      (donation) => donation.status === "succeeded" && !donation.receiptSentAt,
    ),
    draftJournalCount: journalsResult.data?.length ?? 0,
    liveGivingPageCount: givingPagesResult.data?.length ?? 0,
  };
}

// ── Fund account mappings (admin) ────────────────────────────

export type FundMapping = {
  id: string;
  fundDesignation: string;
  assetAccountId: string;
  incomeAccountId: string;
  isActive: boolean;
};

export async function getFundMappings(
  session: ChurchAppSession,
): Promise<FundMapping[]> {
  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    return [];
  }

  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{
      id: string;
      fund_designation: string;
      asset_account_id: string;
      income_account_id: string;
      is_active: boolean;
    }>(
      `select id, fund_designation, asset_account_id, income_account_id, is_active
       from public.giving_fund_accounts
       where church_id = $1
       order by fund_designation`,
      [churchId],
    );
    return result.rows.map((r) => ({
      id: r.id,
      fundDesignation: r.fund_designation,
      assetAccountId: r.asset_account_id,
      incomeAccountId: r.income_account_id,
      isActive: r.is_active,
    }));
  }

  const supabase = await createTenantServerClient();
  const { data } = await supabase
    .from("giving_fund_accounts")
    .select("id, fund_designation, asset_account_id, income_account_id, is_active")
    .eq("church_id", churchId)
    .order("fund_designation");

  return (data ?? []).map((r) => ({
    id: r.id,
    fundDesignation: r.fund_designation,
    assetAccountId: r.asset_account_id,
    incomeAccountId: r.income_account_id,
    isActive: r.is_active,
  }));
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
