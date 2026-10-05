import "server-only";

import { deliverDonationReceipt, type ReceiptDelivery } from "@/lib/stripe/donation-completion";
import type { createTenantAdminClient } from "@/lib/supabase/tenant";

/**
 * One-off re-send of donation receipts that never went out (G5.1): succeeded
 * gifts with `receipt_sent_at` null and a donor email, typically left unsent
 * while no email provider was configured. Run by
 * `scripts/resend-unsent-receipts.mjs`.
 *
 * Each receipt goes through `deliverDonationReceipt`, the same claim/lease and
 * receipt content as a live gift, so a repeat run (or one racing the webhook)
 * can't send twice. Returns counts only, never an email or a name.
 * `server-only`: takes a trusted admin client (ADR 0022).
 */

type AdminClient = ReturnType<typeof createTenantAdminClient>;

export interface ResendReceiptsResult {
  /** Gifts that match: succeeded, no `receipt_sent_at`, a donor email. */
  candidates: number;
  /** Receipts sent (always 0 on a dry run). */
  sent: number;
  /** Left unsent because no email provider is configured. */
  notConfigured: number;
  /** Refused by the provider, or claimed by another attempt. */
  failed: number;
  dryRun: boolean;
}

type CandidateRow = {
  id: string;
  church_id: string;
  amount_cents: number;
  fund_designation: string | null;
  donor_name: string | null;
  donor_email: string | null;
};

const PAGE_SIZE = 200;

export async function resendUnsentReceipts(
  admin: AdminClient,
  options: { apply: boolean; deliver?: typeof deliverDonationReceipt },
): Promise<ResendReceiptsResult> {
  const deliver = options.deliver ?? deliverDonationReceipt;
  const result: ResendReceiptsResult = { candidates: 0, sent: 0, notConfigured: 0, failed: 0, dryRun: !options.apply };

  // Keyset pages by id: a sent receipt leaves the filter, so offsets would skip rows.
  let after: string | null = null;
  for (;;) {
    let query = admin
      .from("donations")
      .select("id, church_id, amount_cents, fund_designation, donor_name, donor_email")
      .eq("status", "succeeded")
      .is("receipt_sent_at", null)
      .not("donor_email", "is", null)
      .order("id", { ascending: true })
      .limit(PAGE_SIZE);
    if (after) query = query.gt("id", after);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as CandidateRow[];
    if (rows.length === 0) break;

    for (const row of rows) {
      if (!row.donor_email) continue;
      result.candidates++;
      if (!options.apply) continue;
      try {
        const outcome: ReceiptDelivery = await deliver(admin, row.church_id, row, row.donor_email);
        if (outcome === "sent") result.sent++;
        else result.notConfigured++;
      } catch {
        result.failed++;
      }
    }
    after = rows[rows.length - 1].id;
    if (rows.length < PAGE_SIZE) break;
  }
  return result;
}
