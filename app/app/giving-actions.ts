"use server";

import { revalidatePath } from "next/cache";

import { requireChurchSession } from "@/lib/auth";
import {
  createTenantServerClient,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";

const GIVING_PATH = "/app/church-admin/giving";

async function requireAdminSession() {
  const session = await requireChurchSession(GIVING_PATH);
  if (session.appContext.roleId !== "church-admin") {
    throw new Error("Unauthorized: giving GL management requires church-admin role.");
  }
  return session;
}

// ── Fund → Account mapping ────────────────────────────────────

export type FundAccountMapping = {
  fundDesignation: string;
  assetAccountId: string;
  incomeAccountId: string;
};

export async function upsertFundMappingAction(
  input: FundAccountMapping,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireAdminSession();
  const churchId = session.appContext.church.id;

  if (!input.fundDesignation.trim()) {
    return { ok: false, error: "Fund designation is required." };
  }

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `insert into public.giving_fund_accounts
         (church_id, fund_designation, asset_account_id, income_account_id)
       values ($1, $2, $3, $4)
       on conflict (church_id, fund_designation)
       do update set
         asset_account_id = $3,
         income_account_id = $4,
         is_active = true`,
      [churchId, input.fundDesignation.trim(), input.assetAccountId, input.incomeAccountId],
    );
    revalidatePath(GIVING_PATH);
    return { ok: true };
  }

  const supabase = await createTenantServerClient();
  const { error } = await supabase.from("giving_fund_accounts").upsert(
    {
      church_id: churchId,
      fund_designation: input.fundDesignation.trim(),
      asset_account_id: input.assetAccountId,
      income_account_id: input.incomeAccountId,
      is_active: true,
    },
    { onConflict: "church_id,fund_designation" },
  );

  if (error) return { ok: false, error: error.message };
  revalidatePath(GIVING_PATH);
  return { ok: true };
}

// ── Manual GL post for a donation ─────────────────────────────

export async function postDonationToGlAction(
  donationId: string,
): Promise<{ ok: boolean; journalId?: string; error?: string }> {
  const session = await requireAdminSession();
  const churchId = session.appContext.church.id;
  const profileId = session.profile.id;

  // Fetch the donation + fund mapping in one pass
  if (shouldUseLocalTenantFallback()) {
    const donationResult = await queryTenantLocalDb<{
      id: string;
      amount_cents: number;
      fund_designation: string | null;
      created_at: string;
    }>(
      `select id, amount_cents, fund_designation, created_at
       from public.donations
       where id = $1 and church_id = $2 and status = 'succeeded'`,
      [donationId, churchId],
    );

    const donation = donationResult.rows[0];
    if (!donation) return { ok: false, error: "Donation not found or not succeeded." };

    const mappingResult = await queryTenantLocalDb<{
      asset_account_id: string;
      income_account_id: string;
    }>(
      `select asset_account_id, income_account_id
       from public.giving_fund_accounts
       where church_id = $1 and fund_designation = $2 and is_active = true`,
      [churchId, donation.fund_designation ?? "General"],
    );

    const mapping = mappingResult.rows[0];
    if (!mapping) {
      return { ok: false, error: `No GL account mapping found for fund: ${donation.fund_designation ?? "General"}. Configure fund mappings first.` };
    }

    // Check if already posted
    const existingResult = await queryTenantLocalDb<{ id: string }>(
      `select id from public.donation_gl_posts where donation_id = $1`,
      [donationId],
    );
    if (existingResult.rows[0]) return { ok: false, error: "This donation has already been posted to GL." };

    // Create journal
    const journalResult = await queryTenantLocalDb<{ id: string }>(
      `insert into public.finance_journals
         (church_id, journal_date, description, journal_type, status, reference, created_by)
       values ($1, $2::date, $3, 'giving', 'posted', $4, $5)
       returning id`,
      [
        churchId,
        donation.created_at,
        `Online giving — ${donation.fund_designation ?? "General Fund"}`,
        donationId,
        profileId,
      ],
    );
    const journalId = journalResult.rows[0]?.id;
    if (!journalId) return { ok: false, error: "Failed to create journal." };

    // Debit asset, credit income
    await queryTenantLocalDb(
      `insert into public.finance_journal_lines
         (journal_id, account_id, description, debit_cents, credit_cents)
       values
         ($1, $2, $3, $4, 0),
         ($1, $5, $3, 0, $4)`,
      [
        journalId,
        mapping.asset_account_id,
        `Donation ${donationId.slice(-8)}`,
        donation.amount_cents,
        mapping.income_account_id,
      ],
    );

    // Record post audit
    await queryTenantLocalDb(
      `insert into public.donation_gl_posts (church_id, donation_id, journal_id, status)
       values ($1, $2, $3, 'posted')`,
      [churchId, donationId, journalId],
    );

    revalidatePath(GIVING_PATH);
    return { ok: true, journalId };
  }

  // Supabase path
  const supabase = await createTenantServerClient();

  const { data: donation } = await supabase
    .from("donations")
    .select("id, amount_cents, fund_designation, created_at")
    .eq("id", donationId)
    .eq("church_id", churchId)
    .eq("status", "succeeded")
    .single();

  if (!donation) return { ok: false, error: "Donation not found or not succeeded." };

  const { data: mapping } = await supabase
    .from("giving_fund_accounts")
    .select("asset_account_id, income_account_id")
    .eq("church_id", churchId)
    .eq("fund_designation", donation.fund_designation ?? "General")
    .eq("is_active", true)
    .single();

  if (!mapping) {
    return { ok: false, error: `No GL mapping for fund: ${donation.fund_designation ?? "General"}. Configure fund mappings first.` };
  }

  const { data: existing } = await supabase
    .from("donation_gl_posts")
    .select("id")
    .eq("donation_id", donationId)
    .single();

  if (existing) return { ok: false, error: "Already posted to GL." };

  const { data: journal, error: journalError } = await supabase
    .from("finance_journals")
    .insert({
      church_id: churchId,
      journal_date: donation.created_at.slice(0, 10),
      description: `Online giving — ${donation.fund_designation ?? "General Fund"}`,
      journal_type: "giving",
      status: "posted",
      reference: donationId,
      created_by: profileId,
    })
    .select("id")
    .single();

  if (journalError || !journal) return { ok: false, error: journalError?.message ?? "Failed to create journal." };

  await supabase.from("finance_journal_lines").insert([
    { journal_id: journal.id, account_id: mapping.asset_account_id,
      description: `Donation ${donationId.slice(-8)}`, debit_cents: donation.amount_cents, credit_cents: 0 },
    { journal_id: journal.id, account_id: mapping.income_account_id,
      description: `Donation ${donationId.slice(-8)}`, debit_cents: 0, credit_cents: donation.amount_cents },
  ]);

  await supabase.from("donation_gl_posts").insert({
    church_id: churchId, donation_id: donationId, journal_id: journal.id, status: "posted",
  });

  revalidatePath(GIVING_PATH);
  return { ok: true, journalId: journal.id };
}

// ── Public giving page config ─────────────────────────────────

export type GivingPageConfig = {
  headline: string;
  description?: string;
  funds: string[];
  stripeAccountId?: string;
  isLive: boolean;
  allowAnonymous: boolean;
};

export async function upsertGivingPageAction(
  input: GivingPageConfig,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireAdminSession();
  const churchId = session.appContext.church.id;
  const slug = session.appContext.church.slug ?? churchId.slice(0, 8);

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `insert into public.public_giving_pages
         (church_id, slug, headline, description, funds, stripe_account_id, is_live, allow_anonymous)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (church_id)
       do update set
         headline = $3, description = $4, funds = $5,
         stripe_account_id = $6, is_live = $7, allow_anonymous = $8,
         updated_at = now()`,
      [
        churchId, slug, input.headline, input.description ?? null,
        JSON.stringify(input.funds), input.stripeAccountId ?? null,
        input.isLive, input.allowAnonymous,
      ],
    );
    revalidatePath(GIVING_PATH);
    return { ok: true };
  }

  const supabase = await createTenantServerClient();
  const { error } = await supabase.from("public_giving_pages").upsert(
    {
      church_id: churchId, slug,
      headline: input.headline, description: input.description ?? null,
      funds: input.funds, stripe_account_id: input.stripeAccountId ?? null,
      is_live: input.isLive, allow_anonymous: input.allowAnonymous,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "church_id" },
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath(GIVING_PATH);
  return { ok: true };
}
