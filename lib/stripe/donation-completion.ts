import "server-only";

import { EmailProviderNotConfiguredError, isProviderNotConfigured } from "@/lib/notifications/email-provider";
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
 * Posts a succeeded gift to the GL (debit the fund's asset account, credit
 * its income account) through `post_donation_to_gl`, which does the check,
 * the journal, its lines and the link in one transaction, one caller at a
 * time per gift: concurrent completions can't post twice, and a failure
 * can't leave half a journal (PR #177 review). Skips a gift already posted
 * and one whose fund has no ledger mapping. Throws on a database error, so
 * the caller can retry (G3.2).
 */
export async function postDonationToGl(supabase: AdminClient, donationId: string, churchId: string): Promise<void> {
  const { error } = await supabase.rpc("post_donation_to_gl", { p_donation_id: donationId, p_church_id: churchId });
  if (error) throw new Error(error.message);
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
  if (isProviderNotConfigured(sent)) throw new EmailProviderNotConfiguredError();
  if (!sent.accepted) throw new Error(`Receipt email refused: ${sent.error ?? "unknown error"}`);
}

/** Finds the gift by one of its ids. */
export type DonationMatch = { id: string } | { paymentIntentId: string } | { invoiceId: string };

/** How long a receipt claim holds before another attempt may take it over. */
export const RECEIPT_LEASE_MS = 5 * 60_000;

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
 * the ledger post is transactional and skipped once done, and the receipt
 * is claimed with a lease before it's sent and marked sent only once the
 * provider accepted it, so two callers never both send it and none
 * completes a gift whose receipt hasn't gone out. Throws on any failure,
 * for the caller to retry. Returns false when there's no such gift, or it was cancelled or
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

  await postDonationToGl(supabase, gift.id, churchId);

  const to = gift.donor_email ?? options.receiptEmailFallback ?? null;
  if (to && !gift.receipt_sent_at) {
    // Claim the send with a lease (receipt_claimed_at), separate from proof
    // of delivery (receipt_sent_at, written once the provider accepts it).
    // Another caller holding a fresh claim means "not done yet": this one
    // throws, and completed_at waits until the receipt really went out. A
    // claim older than the lease is from a worker that stopped, and is
    // taken over (PR #177 review).
    const staleBefore = new Date(Date.now() - RECEIPT_LEASE_MS).toISOString();
    const { data: claimed, error: claimError } = await supabase
      .from("donations")
      .update({ receipt_claimed_at: new Date().toISOString() })
      .eq("id", gift.id)
      .eq("church_id", churchId)
      .is("receipt_sent_at", null)
      .or(`receipt_claimed_at.is.null,receipt_claimed_at.lt."${staleBefore}"`)
      .select("id");
    if (claimError) throw new Error(claimError.message);
    if (!claimed?.length) throw new Error("Another attempt is sending this receipt; retry later.");

    let churchName = options.churchName ?? null;
    if (churchName === null) {
      const { data: church } = await supabase.from("churches").select("name").eq("id", churchId).maybeSingle();
      churchName = (church as { name: string } | null)?.name ?? null;
    }
    let delivered = true;
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
      // Release the claim so the next attempt sends it at once.
      await supabase.from("donations").update({ receipt_claimed_at: null }).eq("id", gift.id).eq("church_id", churchId);
      // No email provider yet: the gift still completes, its receipt stays
      // unsent (receipt_sent_at unset), and no retry is requested (Council Review 42).
      if (!(sendError instanceof EmailProviderNotConfiguredError)) throw sendError;
      console.warn("[donation-completion] email provider not configured; receipt left unsent", { donationId: gift.id });
      delivered = false;
    }
    if (delivered) {
      const { error: sentError } = await supabase
        .from("donations")
        .update({ receipt_sent_at: new Date().toISOString() })
        .eq("id", gift.id)
        .eq("church_id", churchId);
      if (sentError) throw new Error(sentError.message);
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
