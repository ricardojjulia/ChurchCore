import "server-only";

import type { createTenantAdminClient } from "@/lib/supabase/tenant";

import { normalizeEmail, type DonorStatement } from "./build";

type AdminClient = ReturnType<typeof createTenantAdminClient>;

export type SuppressionReason = "manual" | "unsubscribe" | "bounce" | "complaint";

export type EmailDecision =
  | { willEmail: true }
  | { willEmail: false; reason: "no_email" | "opted_out" | "suppressed"; detail: string };

const SUPPRESSION_WORDS: Record<SuppressionReason, string> = {
  manual: "added to the suppression list by staff",
  unsubscribe: "unsubscribed from email",
  bounce: "email address bounced",
  complaint: "reported a message as spam",
};

/**
 * Pure. Order: no address, then the donor's own opt-out (profiles only), then
 * the suppression list (profiles and guests).
 */
export function decideEmail(input: {
  email: string | null;
  profileId: string | null;
  /** `notification_preferences.email_opt_in === false` for this profile. */
  optedOut: boolean;
  suppression: SuppressionReason | null;
}): EmailDecision {
  if (!normalizeEmail(input.email)) {
    return { willEmail: false, reason: "no_email", detail: "No email on file" };
  }
  if (input.profileId && input.optedOut) {
    return { willEmail: false, reason: "opted_out", detail: "Opted out of email" };
  }
  if (input.suppression) {
    return { willEmail: false, reason: "suppressed", detail: `Email suppressed: ${SUPPRESSION_WORDS[input.suppression]}` };
  }
  return { willEmail: true };
}

const CHUNK = 200;
const PAGE = 1000;

/**
 * Batch-reads consent for every statement. An unreadable consent record is
 * not consent: any read error throws, and nothing is sent.
 */
export async function resolveConsent(
  admin: AdminClient,
  churchId: string,
  statements: DonorStatement[],
): Promise<Map<string, EmailDecision>> {
  const optedOut = new Set<string>();
  const profileIds = [...new Set(statements.map((s) => s.profileId).filter((id): id is string => Boolean(id)))];
  for (let i = 0; i < profileIds.length; i += CHUNK) {
    const { data, error } = await admin
      .from("notification_preferences")
      .select("profile_id, email_opt_in")
      .eq("church_id", churchId)
      .in("profile_id", profileIds.slice(i, i + CHUNK));
    if (error) throw new Error(`Failed to read notification preferences: ${error.message}`);
    for (const row of (data ?? []) as Array<{ profile_id: string; email_opt_in: boolean | null }>) {
      if (row.email_opt_in === false) optedOut.add(row.profile_id);
    }
  }

  const suppressed = new Map<string, SuppressionReason>();
  if (statements.some((s) => normalizeEmail(s.email))) {
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await admin
        .from("communication_suppressions")
        .select("contact, reason")
        .eq("church_id", churchId)
        .eq("channel", "email")
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`Failed to read email suppressions: ${error.message}`);
      const rows = (data ?? []) as Array<{ contact: string; reason: SuppressionReason }>;
      for (const row of rows) {
        const contact = normalizeEmail(row.contact);
        if (contact) suppressed.set(contact, row.reason);
      }
      if (rows.length < PAGE) break;
    }
  }

  const decisions = new Map<string, EmailDecision>();
  for (const statement of statements) {
    const email = normalizeEmail(statement.email);
    decisions.set(
      statement.donorKey,
      decideEmail({
        email,
        profileId: statement.profileId,
        optedOut: statement.profileId ? optedOut.has(statement.profileId) : false,
        suppression: email ? (suppressed.get(email) ?? null) : null,
      }),
    );
  }
  return decisions;
}
