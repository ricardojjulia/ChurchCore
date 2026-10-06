import "server-only";

// server-only, not "use server": takes the session as an argument (ADR 0022).
// The caller (a page) has already authenticated; this re-checks the role.

import type { ChurchAppSession } from "@/lib/auth";
import { createTenantAdminClient, createTenantServerClient } from "@/lib/supabase/tenant";

import type { SuppressionChannel, SuppressionReason, SuppressionRow } from "./suppression-types";

export const MAX_SUPPRESSION_ROWS = 1000;
const LOOKUP_CHUNK = 50;
// PostgREST .or() filters are comma/paren-delimited, so a contact containing
// these can't be matched safely that way; such a row simply shows no member name.
const UNSAFE_FILTER_CHARS = /[,()"\\]/;

type RawSuppression = {
  id: string;
  channel: SuppressionChannel;
  contact: string;
  reason: SuppressionReason;
  notes: string | null;
  suppressed_by: string | null;
  created_at: string;
};

type ProfileRow = { id: string; full_name: string | null; email: string | null; phone: string | null };

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Every suppression for the session's church, newest first, with the matching
 * member's name (by email or phone, within the church) and, for manual rows,
 * who added it. The suppressions are read through the user's own client, so
 * RLS (`can_manage_communications`) applies as well as the church filter.
 */
export async function listChurchSuppressions(session: ChurchAppSession): Promise<{ rows: SuppressionRow[]; truncated: boolean }> {
  const role = session.appContext.roleId;
  if (role !== "church-admin" && role !== "pastor" && role !== "secretary") {
    throw new Error("Only church staff may view suppressions.");
  }

  const churchId = session.appContext.church.id;
  const userClient = await createTenantServerClient();
  const { data, error } = await userClient
    .from("communication_suppressions")
    .select("id, channel, contact, reason, notes, suppressed_by, created_at")
    .eq("church_id", churchId)
    .order("created_at", { ascending: false })
    .limit(MAX_SUPPRESSION_ROWS + 1);

  if (error) throw new Error(error.message);
  const fetched = (data ?? []) as RawSuppression[];
  const truncated = fetched.length > MAX_SUPPRESSION_ROWS;
  const rows = truncated ? fetched.slice(0, MAX_SUPPRESSION_ROWS) : fetched;
  if (rows.length === 0) return { rows: [], truncated: false };

  // Name lookups use the church-scoped admin client: a pastor or secretary may
  // not be able to read every profile directly, but the page needs only a name.
  const admin = createTenantAdminClient();
  const byEmail = new Map<string, string>();
  const byPhone = new Map<string, string>();
  const names = new Map<string, string>();

  const emails = [
    ...new Set(rows.filter((r) => r.channel === "email" && !UNSAFE_FILTER_CHARS.test(r.contact)).map((r) => r.contact)),
  ];
  const phones = [
    ...new Set(rows.filter((r) => r.channel === "sms" && !UNSAFE_FILTER_CHARS.test(r.contact)).map((r) => r.contact)),
  ];

  const collect = (profiles: ProfileRow[]) => {
    for (const profile of profiles) {
      const name = profile.full_name?.trim();
      if (!name) continue;
      if (profile.email) byEmail.set(profile.email.trim().toLowerCase(), name);
      if (profile.phone) byPhone.set(profile.phone.trim(), name);
    }
  };

  for (const group of chunk(emails, LOOKUP_CHUNK)) {
    const { data: profiles, error: profileError } = await admin
      .from("profiles")
      .select("id, full_name, email, phone")
      .eq("church_id", churchId)
      .is("merged_at", null)
      .or(group.map((email) => `email.ilike.${email}`).join(","));
    if (profileError) throw new Error(profileError.message);
    collect((profiles ?? []) as ProfileRow[]);
  }
  for (const group of chunk(phones, LOOKUP_CHUNK)) {
    const { data: profiles, error: profileError } = await admin
      .from("profiles")
      .select("id, full_name, email, phone")
      .eq("church_id", churchId)
      .is("merged_at", null)
      .in("phone", group);
    if (profileError) throw new Error(profileError.message);
    collect((profiles ?? []) as ProfileRow[]);
  }

  const adderIds = [
    ...new Set(rows.filter((r) => r.reason === "manual" && r.suppressed_by).map((r) => r.suppressed_by as string)),
  ];
  for (const group of chunk(adderIds, LOOKUP_CHUNK)) {
    const { data: profiles, error: adderError } = await admin
      .from("profiles")
      .select("id, full_name")
      .eq("church_id", churchId)
      .in("id", group);
    if (adderError) throw new Error(adderError.message);
    for (const profile of (profiles ?? []) as { id: string; full_name: string | null }[]) {
      if (profile.full_name) names.set(profile.id, profile.full_name);
    }
  }

  const result = rows.map((row) => ({
    id: row.id,
    channel: row.channel,
    contact: row.contact,
    reason: row.reason,
    notes: row.notes,
    memberName: (row.channel === "email" ? byEmail.get(row.contact.toLowerCase()) : byPhone.get(row.contact)) ?? null,
    addedByName: row.reason === "manual" && row.suppressed_by ? (names.get(row.suppressed_by) ?? null) : null,
    createdAt: row.created_at,
  }));
  return { rows: result, truncated };
}
