"use server";

import { headers } from "next/headers";

import { getPublicGivingPage } from "@/lib/public-giving";
import { isRateLimited } from "@/lib/rate-limit";
import { completeDonation } from "@/lib/stripe/donation-completion";
import {
  cancelPaymentIntent,
  createPaymentIntent,
  onlineGivingNotice,
  onlineGivingStatus,
  stripePublishableKey,
} from "@/lib/stripe/donations";
import { createTenantAdminClient } from "@/lib/supabase/tenant";

// One-time gifts from the public giving page (/give/[slug], G3.1). The
// visitor is signed out: the church comes from the live page's slug, never
// the browser; the gift is charged on the church's own Stripe account
// (ADR 0025) and recorded by the webhook when Stripe says it succeeded,
// which also sends the receipt (completeDonation, G3.2).

const MAX_CENTS = 10_000_000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type PublicGiftInput = {
  slug: string;
  amountCents: number;
  fund: string;
  isAnonymous?: boolean;
  donorName?: string | null;
  donorEmail?: string | null;
  note?: string | null;
};

export type PublicGiftResult =
  | {
      ok: true;
      donationId: string;
      paymentIntentId: string;
      /** Stripe's card form; null when payments are stubbed (development, demo): the gift is recorded already. */
      checkout: { clientSecret: string; publishableKey: string; stripeAccount: string } | null;
    }
  | { ok: false; error: string };

export async function submitPublicGiftAction(input: PublicGiftInput): Promise<PublicGiftResult> {
  const forwardedFor = (await headers()).get("x-forwarded-for") ?? "";
  const ip = forwardedFor.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(`public-gift:${ip}`, 10, 60_000)) {
    return { ok: false, error: "Too many gifts from this connection. Please wait a minute and try again." };
  }

  const page = await getPublicGivingPage(input.slug ?? "").catch(() => null);
  if (!page) return { ok: false, error: "This giving page isn't available." };

  if (!Number.isInteger(input.amountCents) || input.amountCents < 100 || input.amountCents > MAX_CENTS) {
    return { ok: false, error: "Enter a gift of at least $1." };
  }
  if (!page.funds.includes(input.fund)) return { ok: false, error: "Choose one of this church's funds." };
  const anonymous = Boolean(input.isAnonymous) && page.allowAnonymous;
  const donorEmail = input.donorEmail?.trim().toLowerCase() || null;
  if (!anonymous && (!donorEmail || !EMAIL.test(donorEmail))) {
    return { ok: false, error: "Enter a valid email for your receipt." };
  }
  if (donorEmail && !EMAIL.test(donorEmail)) return { ok: false, error: "Enter a valid email for your receipt." };

  const giving = await onlineGivingStatus(page.churchId);
  const off = onlineGivingNotice(giving.mode);
  if (off) return { ok: false, error: off };

  const supabase = createTenantAdminClient();
  const { data: row, error } = await supabase
    .from("donations")
    .insert({
      church_id: page.churchId,
      profile_id: null,
      // An anonymous gift keeps the giver's name out of church records; the
      // receipt still goes to the email they gave, if any.
      donor_name: anonymous ? null : input.donorName?.trim().slice(0, 200) || null,
      donor_email: donorEmail,
      amount_cents: input.amountCents,
      currency: "usd",
      fund_designation: input.fund,
      is_recurring: false,
      is_anonymous: anonymous,
      note: input.note?.trim().slice(0, 1000) || null,
      status: "pending",
      stripe_account_id: giving.stripeAccount,
    })
    .select("id")
    .single();
  if (error || !row) {
    console.error("[public-gift] Insert failed:", error?.message);
    return { ok: false, error: "Couldn't start your gift. Please try again." };
  }
  const donationId = (row as { id: string }).id;

  try {
    const intent = await createPaymentIntent({
      amountCents: input.amountCents,
      churchId: page.churchId,
      donationId,
      fundDesignation: input.fund,
      donorEmail: donorEmail ?? undefined,
      stripeAccount: giving.stripeAccount,
    });
    const { error: linkError } = await supabase
      .from("donations")
      .update({ stripe_payment_intent_id: intent.paymentIntentId })
      .eq("id", donationId)
      .eq("church_id", page.churchId);
    if (linkError) throw new Error(linkError.message);

    if (intent.isStub) {
      // No card to take (development, demo): record the gift now. By id: every
      // stub shares one PaymentIntent id.
      await completeDonation(supabase, page.churchId, { id: donationId }, { churchName: page.churchName });
      return { ok: true, donationId, paymentIntentId: intent.paymentIntentId, checkout: null };
    }
    const publishableKey = stripePublishableKey();
    if (!publishableKey || !giving.stripeAccount) throw new Error("No publishable key or account.");
    return {
      ok: true,
      donationId,
      paymentIntentId: intent.paymentIntentId,
      checkout: { clientSecret: intent.clientSecret, publishableKey, stripeAccount: giving.stripeAccount },
    };
  } catch (startError) {
    console.error("[public-gift] Starting the payment failed:", startError instanceof Error ? startError.message : startError);
    await supabase
      .from("donations")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", donationId)
      .eq("church_id", page.churchId)
      .eq("status", "pending");
    return { ok: false, error: "Couldn't start the payment. Please try again." };
  }
}

/**
 * The visitor left the card step without paying: cancel the PaymentIntent,
 * then the pending gift. Signed out, so the proof is holding both the gift id
 * and its PaymentIntent id, which only this visitor's browser was given, and
 * only a still-pending gift is touched. If Stripe says the payment went
 * through, nothing is cancelled and the webhook records it.
 */
export async function cancelPublicGiftAction(
  donationId: string,
  paymentIntentId: string,
): Promise<{ ok: boolean; cancelled: boolean; error?: string }> {
  if (!donationId || !paymentIntentId || paymentIntentId === "pi_stub") return { ok: true, cancelled: false };
  const supabase = createTenantAdminClient();
  const { data, error } = await supabase
    .from("donations")
    .select("id, church_id, stripe_account_id")
    .eq("id", donationId)
    .eq("stripe_payment_intent_id", paymentIntentId)
    .is("profile_id", null)
    .eq("status", "pending")
    .maybeSingle();
  if (error) return { ok: false, cancelled: false, error: "Couldn't cancel the gift. Please try again." };
  if (!data) return { ok: true, cancelled: false };
  const gift = data as { id: string; church_id: string; stripe_account_id: string | null };

  let status: string;
  try {
    status = await cancelPaymentIntent(paymentIntentId, gift.stripe_account_id);
  } catch {
    return { ok: false, cancelled: false, error: "Couldn't cancel the payment. Please try again." };
  }
  if (status !== "canceled") return { ok: true, cancelled: false };

  const { error: updateError } = await supabase
    .from("donations")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", gift.id)
    .eq("church_id", gift.church_id)
    .eq("status", "pending");
  if (updateError) return { ok: false, cancelled: false, error: "Couldn't cancel the gift. Please try again." };
  return { ok: true, cancelled: true };
}
