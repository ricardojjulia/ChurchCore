import "server-only";

import { todayInTimeZone } from "@/lib/church-time";
import { createTenantServerClient } from "@/lib/supabase/tenant";

// Supabase-only lookup indexes shared by the CSV importers (G4.1). Every query
// is scoped to the church from the session and paginated: Supabase caps a
// plain select at 1,000 rows, which silently truncated the old loaders.

const PAGE_SIZE = 1000;

type PageResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/** Read every page of a query. `fetchPage` must apply a stable order. Throws on a database error. */
export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PageResult<T>,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1);
    if (error) {
      throw new Error("Unable to load existing records for the import.");
    }
    const page = data ?? [];
    all.push(...page);
    if (page.length < PAGE_SIZE) return all;
  }
}

export type ProfileLinkIndex = {
  byMemberNumber: Map<string, string>;
  byEmail: Map<string, string>;
};

/** Profiles of one church, by member number and by lowercased email. Merged-away profiles are excluded. */
export async function loadProfileLinkIndex(churchId: string): Promise<ProfileLinkIndex> {
  const supabase = await createTenantServerClient();
  const rows = await fetchAllPages<{
    id: string;
    email: string | null;
    member_number: string | null;
  }>((from, to) =>
    supabase
      .from("profiles")
      .select("id, email, member_number")
      .eq("church_id", churchId)
      .is("merged_into_profile_id", null)
      .order("id", { ascending: true })
      .range(from, to),
  );

  const byMemberNumber = new Map<string, string>();
  const byEmail = new Map<string, string>();
  for (const row of rows) {
    const memberNumber = row.member_number?.trim();
    if (memberNumber && !byMemberNumber.has(memberNumber)) {
      byMemberNumber.set(memberNumber, row.id);
    }
    const email = row.email?.trim().toLowerCase();
    if (email && !byEmail.has(email)) {
      byEmail.set(email, row.id);
    }
  }
  return { byMemberNumber, byEmail };
}

/** `source_id` -> row id for a church-scoped table that carries a source_id column. */
export async function loadSourceIdIndex(
  churchId: string,
  table: "donations" | "attendance" | "events" | "groups",
): Promise<Map<string, string>> {
  const supabase = await createTenantServerClient();
  const rows = await fetchAllPages<{ id: string; source_id: string | null }>((from, to) =>
    supabase
      .from(table)
      .select("id, source_id")
      .eq("church_id", churchId)
      .not("source_id", "is", null)
      .order("id", { ascending: true })
      .range(from, to),
  );

  const map = new Map<string, string>();
  for (const row of rows) {
    if (row.source_id) map.set(row.source_id, row.id);
  }
  return map;
}

export function eventTitleDayKey(title: string, day: string): string {
  return `${title.trim().toLowerCase()}|${day}`;
}

/**
 * Events keyed by lowercased title and church-local calendar day. A key that
 * more than one event shares maps to several ids, so the importer can refuse to guess.
 */
export async function loadEventTitleDayIndex(
  churchId: string,
  timeZone: string | null,
): Promise<Map<string, string[]>> {
  const supabase = await createTenantServerClient();
  const rows = await fetchAllPages<{ id: string; title: string | null; starts_at: string | null }>(
    (from, to) =>
      supabase
        .from("events")
        .select("id, title, starts_at")
        .eq("church_id", churchId)
        .order("id", { ascending: true })
        .range(from, to),
  );

  const map = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.title || !row.starts_at) continue;
    const startsAt = new Date(row.starts_at);
    if (Number.isNaN(startsAt.getTime())) continue;
    const key = eventTitleDayKey(row.title, todayInTimeZone(timeZone, startsAt));
    map.set(key, [...(map.get(key) ?? []), row.id]);
  }
  return map;
}

/** `profile_id:event_id` pairs already marked present. */
export async function loadPresentPairs(churchId: string): Promise<Set<string>> {
  const supabase = await createTenantServerClient();
  const rows = await fetchAllPages<{ profile_id: string | null; event_id: string | null }>(
    (from, to) =>
      supabase
        .from("attendance")
        .select("id, profile_id, event_id")
        .eq("church_id", churchId)
        .eq("status", "present")
        .not("profile_id", "is", null)
        .not("event_id", "is", null)
        .order("id", { ascending: true })
        .range(from, to),
  );

  const set = new Set<string>();
  for (const row of rows) {
    if (row.profile_id && row.event_id) set.add(`${row.profile_id}:${row.event_id}`);
  }
  return set;
}

/** Groups of a church by lowercased name -> id. */
export async function loadGroupNameIndex(churchId: string): Promise<Map<string, string>> {
  const supabase = await createTenantServerClient();
  const rows = await fetchAllPages<{ id: string; name: string | null }>((from, to) =>
    supabase
      .from("groups")
      .select("id, name")
      .eq("church_id", churchId)
      .order("id", { ascending: true })
      .range(from, to),
  );

  const map = new Map<string, string>();
  for (const row of rows) {
    const key = row.name?.trim().toLowerCase();
    if (key && !map.has(key)) map.set(key, row.id);
  }
  return map;
}

/** `group_id:profile_id` pairs that already have a membership row. */
export async function loadMembershipPairs(churchId: string): Promise<Set<string>> {
  const supabase = await createTenantServerClient();
  const rows = await fetchAllPages<{ group_id: string; profile_id: string }>((from, to) =>
    supabase
      .from("group_members")
      .select("id, group_id, profile_id")
      .eq("church_id", churchId)
      .order("id", { ascending: true })
      .range(from, to),
  );

  return new Set(rows.map((row) => `${row.group_id}:${row.profile_id}`));
}
