import "server-only";

import { sendEmail } from "@/lib/notifications/send-email";
import type { createTenantAdminClient } from "@/lib/supabase/tenant";

/**
 * What happens once a gift is marked succeeded: it's posted to the general
 * ledger and the donor gets a receipt. Shared by the Stripe webhook and
 * `confirmDonationAction`, so whichever of the two wins the
 * `pending → succeeded` update does both, exactly once (Council Review 22).
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
 * its income account. Idempotent (skips a gift already in
 * `donation_gl_posts`), skips silently when the fund has no account mapping,
 * and never throws — a posting failure must not undo a completed gift.
 */
export async function postDonationToGl(
  supabase: AdminClient,
  donationId: string,
  churchId: string,
  amountCents: number,
  fundDesignation: string | null,
): Promise<void> {
  try {
    // Idempotency: skip if already posted
    const { data: existing } = await supabase
      .from("donation_gl_posts")
      .select("id")
      .eq("donation_id", donationId)
      .maybeSingle();
    if (existing) return;

    // Fund → GL account mapping
    const { data: mapping } = await supabase
      .from("giving_fund_accounts")
      .select("asset_account_id, income_account_id")
      .eq("church_id", churchId)
      .eq("fund_designation", fundDesignation ?? "General")
      .eq("is_active", true)
      .maybeSingle();
    if (!mapping) return; // No mapping configured — skip silently

    const { asset_account_id, income_account_id } = mapping as {
      asset_account_id: string;
      income_account_id: string;
    };

    const { data: journal } = await supabase
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
    if (!journal) return;

    const journalId = (journal as { id: string }).id;
    const lineMemo = `Donation ${donationId.slice(-8)}`;

    // Balanced journal lines: debit asset, credit income
    await supabase.from("finance_journal_lines").insert([
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

    await supabase.from("donation_gl_posts").insert({
      church_id: churchId,
      donation_id: donationId,
      journal_id: journalId,
      status: "posted",
    });
  } catch (err) {
    console.error("[donations] postDonationToGl failed (non-blocking):", err);
  }
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

/** Emails the donor's receipt. Idempotent per donation (the send key is the donation id). */
export async function sendDonationReceipt(receipt: DonationReceipt): Promise<void> {
  const dollars = (receipt.amountCents / 100).toFixed(2);
  const fund = receipt.fundDesignation ?? "General Fund";
  const at = receipt.churchName ? ` at ${receipt.churchName}` : "";
  const greeting = receipt.donorName ? `Dear ${receipt.donorName},` : "Dear Friend,";

  await sendEmail({
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
}
