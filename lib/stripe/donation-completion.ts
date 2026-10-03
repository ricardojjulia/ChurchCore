import "server-only";

import { sendEmail } from "@/lib/notifications/send-email";
import type { createTenantAdminClient } from "@/lib/supabase/tenant";

/**
 * What happens once a gift succeeds: it's posted to the general ledger, the
 * donor gets a receipt, and the gift is marked complete. Shared by the Stripe
 * webhook, `confirmDonationAction` and recurring installments.
 *
 * Retry-safe (G3.2): every step can be repeated, and `completed_at` is
 * written last, so a step that fails leaves the gift incomplete and the
 * webhook's 5xx makes Stripe retry it.
 *
 * `server-only`: callers pass a trusted church id (ADR 0022).
 */

type AdminClient = ReturnType<typeof createTenantAdminClient>;

/** Escapes text for HTML email bodies; donor names and fund labels are client-supplied. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Posts a succeeded gift to the GL: debit the fund's asset account, credit
 * its income account. Repeatable: a gift already in `donation_gl_posts` is
 * skipped, and a journal left half-written by a failed attempt is replaced.
 * Skips silently when the fund has no account mapping. Throws on a database
 * error, so the caller can retry (G3.2).
 */
export async function postDonationToGl(
  supabase: AdminClient,
  donationId: string,
  churchId: string,
  amountCents: number,
  fundDesignation: string | null,
): Promise<void> {
  const { data: existing, error: existingError } = await supabase
    .from("donation_gl_posts")
    .select("id")
    .eq("donation_id", donationId)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing) return;

  const { data: mapping, error: mappingError } = await supabase
    .from("giving_fund_accounts")
    .select("asset_account_id, income_account_id")
    .eq("church_id", churchId)
    .eq("fund_designation", fundDesignation ?? "General")
    .eq("is_active", true)
    .maybeSingle();
  if (mappingError) throw new Error(mappingError.message);
  if (!mapping) return; // No mapping configured: nothing to post.

  const { asset_account_id, income_account_id } = mapping as {
    asset_account_id: string;
    income_account_id: string;
  };

  // A journal from an attempt that failed before donation_gl_posts was
  // written: remove it (its lines cascade) and post again. Only this
  // function writes "giving" journals; the manual post
  // (postDonationToGlAction) writes "general" ones and is never touched here.
  const { error: orphanError } = await supabase
    .from("finance_journals")
    .delete()
    .eq("church_id", churchId)
    .eq("journal_type", "giving")
    .eq("reference", donationId);
  if (orphanError) throw new Error(orphanError.message);

  const { data: journal, error: journalError } = await supabase
    .from("finance_journals")
    .insert({
      church_id: churchId,
      journal_date: new Date().toISOString().slice(0, 10),
      description: `Online giving — ${fundDesignation ?? "General Fund"}`,
      journal_type: "giving",
      status: "posted",
      reference: donationId,
    })
    .select("id")
    .single();
  if (journalError || !journal) throw new Error(journalError?.message ?? "Journal insert returned nothing.");

  const journalId = (journal as { id: string }).id;
  const lineMemo = `Donation ${donationId.slice(-8)}`;

  // Balanced journal lines: debit asset, credit income
  const { error: linesError } = await supabase.from("finance_journal_lines").insert([
    {
      journal_id: journalId,
      church_id: churchId,
      account_id: asset_account_id,
      side: "debit",
      amount_cents: amountCents,
      memo: lineMemo,
      sort_order: 0,
    },
    {
      journal_id: journalId,
      church_id: churchId,
      account_id: income_account_id,
      side: "credit",
      amount_cents: amountCents,
      memo: lineMemo,
      sort_order: 1,
    },
  ]);
  if (linesError) throw new Error(linesError.message);

  const { error: postError } = await supabase.from("donation_gl_posts").insert({
    church_id: churchId,
    donation_id: donationId,
    journal_id: journalId,
    status: "posted",
  });
  if (postError) throw new Error(postError.message);
}

export interface DonationReceipt {
  to: string;
  donorName: string | null;
  amountCents: number;
  fundDesignation: string | null;
  donationId: string;
  /** Shown in the receipt when known. */
  churchName?: string | null;
}

/** Emails the donor's receipt. Throws when the email provider refuses it, so the caller can retry. */
export async function sendDonationReceipt(receipt: DonationReceipt): Promise<void> {
  const dollars = (receipt.amountCents / 100).toFixed(2);
  const fund = receipt.fundDesignation ?? "General Fund";
  const at = receipt.churchName ? ` at ${receipt.churchName}` : "";
  const greeting = receipt.donorName ? `Dear ${receipt.donorName},` : "Dear Friend,";

  const sent = await sendEmail({
    to: receipt.to,
    subject: receipt.churchName ? `Thank you for your gift to ${receipt.churchName}` : `Your gift of $${dollars} — receipt`,
    text: [
      greeting,
      "",
      `Thank you for your generous and voluntary gift of $${dollars} to the ${fund}${at}.`,
      "",
      `Donation reference: ${receipt.donationId}`,
      "",
      "This receipt is for your records. Please retain it for tax purposes.",
    ].join("\n"),
    html: `
      <p>${escapeHtml(greeting)}</p>
      <p>Thank you for your generous and voluntary gift of <strong>$${dollars}</strong> to the <strong>${escapeHtml(fund)}</strong>${escapeHtml(at)}.</p>
      <p style="color:#666;font-size:12px;">Donation reference: ${escapeHtml(receipt.donationId)}</p>
      <p style="color:#666;font-size:12px;">This receipt is for your records. Please retain it for tax purposes.</p>
    `,
    idempotencyKey: receipt.donationId,
  });
  if (!sent.accepted) throw new Error(`Receipt email refused: ${sent.error ?? "unknown error"}`);
}

/** Finds the gift by one of its ids. */
export type DonationMatch = { id: string } | { paymentIntentId: string } | { invoiceId: string };

type CompletionRow = {
  id: string;
  status: string;
  amount_cents: number;
  fund_designation: string | null;
  donor_email: string | null;
  donor_name: string | null;
  receipt_sent_at: string | null;
  completed_at: string | null;
};

/**
 * Completes a gift Stripe has charged: marks it succeeded, posts it to the
 * ledger, sends the receipt, and only then writes `completed_at`. Every step
 * can be repeated: a retried webhook resumes a gift without `completed_at`,
 * the ledger post is skipped once done, and the receipt is claimed (by
 * `receipt_sent_at`) before it's sent, so two callers never both send it; a
 * failed send releases the claim. Throws on any failure, for the caller to
 * retry. Returns false when there's no such gift, or it was cancelled or
 * refunded.
 */
export async function completeDonation(
  supabase: AdminClient,
  churchId: string,
  match: DonationMatch,
  options: { receiptEmailFallback?: string | null; churchName?: string | null } = {},
): Promise<boolean> {
  let query = supabase
    .from("donations")
    .select("id, status, amount_cents, fund_designation, donor_email, donor_name, receipt_sent_at, completed_at")
    .eq("church_id", churchId);
  if ("id" in match) query = query.eq("id", match.id);
  else if ("paymentIntentId" in match) query = query.eq("stripe_payment_intent_id", match.paymentIntentId);
  else query = query.eq("stripe_invoice_id", match.invoiceId);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  const gift = data as CompletionRow | null;
  if (!gift) return false;
  if (gift.completed_at) return true;
  if (gift.status === "cancelled" || gift.status === "refunded") return false;

  if (gift.status !== "succeeded") {
    const { error: flipError } = await supabase
      .from("donations")
      .update({ status: "succeeded", updated_at: new Date().toISOString() })
      .eq("id", gift.id)
      .eq("church_id", churchId)
      .in("status", ["pending", "failed"]);
    if (flipError) throw new Error(flipError.message);
  }

  await postDonationToGl(supabase, gift.id, churchId, gift.amount_cents, gift.fund_designation);

  const to = gift.donor_email ?? options.receiptEmailFallback ?? null;
  if (to && !gift.receipt_sent_at) {
    const { data: claimed, error: claimError } = await supabase
      .from("donations")
      .update({ receipt_sent_at: new Date().toISOString() })
      .eq("id", gift.id)
      .eq("church_id", churchId)
      .is("receipt_sent_at", null)
      .select("id");
    if (claimError) throw new Error(claimError.message);
    if (claimed?.length) {
      let churchName = options.churchName ?? null;
      if (churchName === null) {
        const { data: church } = await supabase.from("churches").select("name").eq("id", churchId).maybeSingle();
        churchName = (church as { name: string } | null)?.name ?? null;
      }
      try {
        await sendDonationReceipt({
          to,
          donorName: gift.donor_name,
          amountCents: gift.amount_cents,
          fundDesignation: gift.fund_designation,
          donationId: gift.id,
          churchName,
        });
      } catch (sendError) {
        // Release the claim so a retry sends it.
        await supabase.from("donations").update({ receipt_sent_at: null }).eq("id", gift.id).eq("church_id", churchId);
        throw sendError;
      }
    }
  }

  const { error: markError } = await supabase
    .from("donations")
    .update({ completed_at: new Date().toISOString() })
    .eq("id", gift.id)
    .eq("church_id", churchId);
  if (markError) throw new Error(markError.message);
  return true;
}
