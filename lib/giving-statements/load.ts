import "server-only";

import type { createTenantAdminClient } from "@/lib/supabase/tenant";

import {
  buildStatements,
  giftLocalDate,
  rangeInstants,
  type ProfileInfo,
  type StatementBuild,
  type StatementGift,
  type StatementRange,
} from "./build";

type AdminClient = ReturnType<typeof createTenantAdminClient>;

const PAGE = 1000;
const CHUNK = 200;

export type ChurchHeader = {
  name: string;
  legalName: string | null;
  mailingAddress: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  websiteUrl: string | null;
};

export async function loadChurchHeader(admin: AdminClient, churchId: string): Promise<ChurchHeader> {
  const { data, error } = await admin
    .from("churches")
    .select("name, legal_name, mailing_address, contact_email, contact_phone, website_url")
    .eq("id", churchId)
    .single();
  if (error || !data) throw new Error(`Failed to read church details: ${error?.message ?? "not found"}`);
  const row = data as Record<string, string | null>;
  return {
    name: row.name ?? "Church",
    legalName: row.legal_name?.trim() || null,
    mailingAddress: row.mailing_address?.trim() || null,
    contactEmail: row.contact_email?.trim() || null,
    contactPhone: row.contact_phone?.trim() || null,
    websiteUrl: row.website_url?.trim() || null,
  };
}

type GiftRow = {
  id: string;
  profile_id: string | null;
  donor_name: string | null;
  donor_email: string | null;
  is_anonymous: boolean;
  amount_cents: number;
  currency: string | null;
  fund_designation: string | null;
  status: string;
  created_at: string;
};

/** Succeeded gifts whose church-local date is in the inclusive range. Paged. */
export async function loadGifts(
  admin: AdminClient,
  churchId: string,
  timeZone: string | null,
  range: StatementRange,
  options: { profileId?: string } = {},
): Promise<StatementGift[]> {
  const bounds = rangeInstants(range, timeZone);
  if (!bounds) throw new Error("Invalid statement range.");

  const gifts: StatementGift[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = admin
      .from("donations")
      .select("id, profile_id, donor_name, donor_email, is_anonymous, amount_cents, currency, fund_designation, status, created_at")
      .eq("church_id", churchId)
      .eq("status", "succeeded")
      .gte("created_at", bounds.start.toISOString())
      .lt("created_at", bounds.endExclusive.toISOString());
    if (options.profileId) query = query.eq("profile_id", options.profileId);
    const { data, error } = await query
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Failed to read donations: ${error.message}`);
    const rows = (data ?? []) as GiftRow[];
    for (const row of rows) {
      gifts.push({
        id: row.id,
        profileId: row.profile_id,
        donorName: row.donor_name,
        donorEmail: row.donor_email,
        isAnonymous: Boolean(row.is_anonymous),
        amountCents: row.amount_cents,
        currency: row.currency ?? "usd",
        fund: row.fund_designation,
        status: row.status,
        createdAt: row.created_at,
      });
    }
    if (rows.length < PAGE) break;
  }
  return gifts;
}

export async function loadProfiles(
  admin: AdminClient,
  churchId: string,
  profileIds: string[],
): Promise<Map<string, ProfileInfo>> {
  const profiles = new Map<string, ProfileInfo>();
  const unique = [...new Set(profileIds)];
  for (let i = 0; i < unique.length; i += CHUNK) {
    const { data, error } = await admin
      .from("profiles")
      .select("id, full_name, email")
      .eq("church_id", churchId)
      .in("id", unique.slice(i, i + CHUNK));
    if (error) throw new Error(`Failed to read donor profiles: ${error.message}`);
    for (const row of (data ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>) {
      profiles.set(row.id, { name: row.full_name, email: row.email });
    }
  }
  return profiles;
}

/** Gifts, donor names and the built statements for a range. */
export async function loadStatementRun(
  admin: AdminClient,
  churchId: string,
  timeZone: string | null,
  range: StatementRange,
  options: { profileId?: string } = {},
): Promise<StatementBuild> {
  const gifts = await loadGifts(admin, churchId, timeZone, range, options);
  const profiles = await loadProfiles(
    admin,
    churchId,
    gifts.map((g) => g.profileId).filter((id): id is string => Boolean(id)),
  );
  return buildStatements(gifts, { timeZone, range, profiles });
}

/** Calendar years (church-local, newest first) in which this profile has a succeeded gift. */
export async function listStatementYears(
  admin: AdminClient,
  churchId: string,
  profileId: string,
  timeZone: string | null,
): Promise<number[]> {
  const years = new Set<number>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("donations")
      .select("created_at")
      .eq("church_id", churchId)
      .eq("profile_id", profileId)
      .eq("status", "succeeded")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Failed to read donations: ${error.message}`);
    const rows = (data ?? []) as Array<{ created_at: string }>;
    for (const row of rows) years.add(Number(giftLocalDate(row.created_at, timeZone).slice(0, 4)));
    if (rows.length < PAGE) break;
  }
  return [...years].sort((a, b) => b - a);
}
