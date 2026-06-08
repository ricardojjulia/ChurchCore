import "server-only";

import type { CommunicationChannel, SegmentFilter } from "@/lib/communications-types";
import { createTenantServerClient } from "@/lib/supabase/tenant";

export type ResolvedRecipient = {
  profileId: string;
  name: string;
  contact: string;
};

/**
 * Resolves the full list of matching recipients for a given segment filter
 * scoped to a single church. Used by both previewRecipientsAction (with limit)
 * and composeAndSendMessageAction / scheduled-send cron (without limit).
 *
 * IMPORTANT: `churchId` must always come from a trusted server-side source
 * (session or communication_logs row). Never pass user-supplied churchId.
 */
export async function resolveRecipients(
  churchId: string,
  channel: CommunicationChannel,
  segment: SegmentFilter,
  limit?: number,
): Promise<ResolvedRecipient[]> {
  const supabase = await createTenantServerClient();

  // Base query: contactable, non-merged profiles for this church
  let query = supabase
    .from("profiles")
    .select(
      `id, full_name, email, phone,
       notification_preferences!left(email_opt_in, sms_opt_in)`,
    )
    .eq("church_id", churchId)
    .eq("contact_allowed", true)
    .is("merged_into_profile_id", null);

  if (segment.role) {
    query = query.eq("role", segment.role);
  }

  if (segment.membershipStatus) {
    query = query.eq("membership_status", segment.membershipStatus);
  }

  if (limit !== undefined) {
    query = query.limit(limit);
  }

  const { data: profileRows, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  if (!profileRows || profileRows.length === 0) {
    return [];
  }

  // Collect suppressed contacts for this church+channel
  const { data: suppressions, error: suppError } = await supabase
    .from("communication_suppressions")
    .select("contact")
    .eq("church_id", churchId)
    .eq("channel", channel);

  if (suppError) {
    throw new Error(suppError.message);
  }

  const suppressedSet = new Set(
    (suppressions ?? []).map((s: { contact: string }) => s.contact.toLowerCase()),
  );

  // Ministry filter
  let ministryProfileIds: Set<string> | null = null;
  if (segment.ministryIds && segment.ministryIds.length > 0) {
    const { data: pmRows, error: pmError } = await supabase
      .from("profile_ministries")
      .select("profile_id")
      .in("ministry_id", segment.ministryIds)
      .eq("church_id", churchId);

    if (pmError) {
      throw new Error(pmError.message);
    }

    ministryProfileIds = new Set(
      (pmRows ?? []).map((r: { profile_id: string }) => r.profile_id),
    );
  }

  // Attendance filter
  let attendanceProfileIds: Set<string> | null = null;
  if (segment.attendedWithinDays !== undefined && segment.attendedWithinDays > 0) {
    const cutoff = new Date(
      Date.now() - segment.attendedWithinDays * 24 * 60 * 60 * 1000,
    ).toISOString();
    const { data: attRows, error: attError } = await supabase
      .from("attendance_records")
      .select("profile_id")
      .eq("church_id", churchId)
      .gte("checked_in_at", cutoff);

    if (attError) {
      throw new Error(attError.message);
    }

    attendanceProfileIds = new Set(
      (attRows ?? []).map((r: { profile_id: string }) => r.profile_id),
    );
  }

  const results: ResolvedRecipient[] = [];

  for (const row of profileRows) {
    // Ministry filter
    if (ministryProfileIds !== null && !ministryProfileIds.has(row.id)) {
      continue;
    }

    // Attendance filter
    if (attendanceProfileIds !== null && !attendanceProfileIds.has(row.id)) {
      continue;
    }

    // Opt-in check
    const prefs = Array.isArray(row.notification_preferences)
      ? (row.notification_preferences[0] as {
          email_opt_in: boolean;
          sms_opt_in: boolean;
        } | null)
      : (row.notification_preferences as {
          email_opt_in: boolean;
          sms_opt_in: boolean;
        } | null);

    let optedIn: boolean;
    if (channel === "email") {
      // Default: opted in when no pref row
      optedIn = prefs !== null && prefs !== undefined ? prefs.email_opt_in : true;
    } else {
      // Default: opted out when no pref row
      optedIn = prefs !== null && prefs !== undefined ? prefs.sms_opt_in : false;
    }

    if (!optedIn) {
      continue;
    }

    const contact: string | null =
      channel === "email" ? (row.email ?? null) : (row.phone ?? null);
    if (!contact) {
      continue;
    }

    if (suppressedSet.has(contact.toLowerCase())) {
      continue;
    }

    results.push({
      profileId: row.id,
      name: row.full_name ?? "",
      contact,
    });
  }

  return results;
}
