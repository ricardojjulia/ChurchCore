"use server";

import { revalidatePath } from "next/cache";

import { requireChurchSession } from "@/lib/auth";
import {
  cancelPaymentIntent,
  cancelStripeSubscription,
  createOrGetStripeCustomer,
  createPaymentIntent,
  onlineGivingNotice,
  retrievePaymentIntentStatus,
} from "@/lib/stripe/donations";
import { postDonationToGl, sendDonationReceipt } from "@/lib/stripe/donation-completion";
import { createTenantAdminClient } from "@/lib/supabase/tenant";

// ── Types ────────────────────────────────────────────────────

export interface InitiateDonationInput {
  amountCents: number;
  fundDesignation?: string;
  isAnonymous?: boolean;
  note?: string;
  donorName?: string;
  donorEmail?: string;
}

/** Largest single gift accepted online, in cents ($100,000). */
const MAX_DONATION_CENTS = 10_000_000;

export type InitiateDonationResult =
  | {
      ok: true;
      /** Stripe PaymentIntent client_secret — pass to Stripe Elements. */
      clientSecret: string;
      /** Our donations row id — pass back to confirmDonationAction. */
      donationId: string;
      /** The PaymentIntent id — pass back to confirmDonationAction. */
      paymentIntentId: string;
      isStub: boolean;
    }
  | { ok: false; error: string };

// ── Actions ──────────────────────────────────────────────────
//
// S8: members have no INSERT/UPDATE policy on donations (only managers do),
// so these used to fail under RLS — after a Stripe PaymentIntent had already
// been created. They now write through the admin client, scoped server-side
// to the signed-in member and church (ADR 0022), and the pending row is
// written *before* Stripe is called. Supabase-only (the local-SQL branches
// were removed, per the Supabase-only mandate).

/**
 * initiateDonationAction
 *
 * Writes a pending donations row, then creates the Stripe PaymentIntent for
 * it. If Stripe fails, the row is marked failed; nothing is left half-made.
 * Runs in stub mode (development and demo) and live mode (both Stripe keys
 * set; the member pays with the card form, G3.0). Otherwise no row or
 * PaymentIntent is created, so nothing is left pending forever.
 *
 * All giving is 100% voluntary — no minimum, no platform fee.
 */
export async function initiateDonationAction(
  input: InitiateDonationInput,
): Promise<InitiateDonationResult> {
  const session = await requireChurchSession("/app/member");
  const churchId = session.appContext.church.id;
  const profileId = session.churchProfileId;
  if (!profileId) return { ok: false, error: "Your account has no profile in this church." };
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0 || input.amountCents > MAX_DONATION_CENTS) {
    return { ok: false, error: "Enter a gift amount between $0.01 and $100,000." };
  }
  const givingOff = onlineGivingNotice();
  if (givingOff) return { ok: false, error: givingOff };

  const anonymous = input.isAnonymous ?? false;
  const supabase = createTenantAdminClient();
  const { data: row, error: insertError } = await supabase
    .from("donations")
    .insert({
      church_id: churchId,
      profile_id: anonymous ? null : profileId,
      donor_name: anonymous ? null : (input.donorName ?? null),
      donor_email: anonymous ? null : (input.donorEmail ?? null),
      amount_cents: input.amountCents,
      fund_designation: input.fundDesignation ?? null,
      is_anonymous: anonymous,
      status: "pending",
      note: input.note ?? null,
    })
    .select("id")
    .single();
  if (insertError || !row) {
    console.error("Failed to record donation:", insertError?.message);
    return { ok: false, error: "Couldn't start your gift. Please try again." };
  }
  const donationId = (row as { id: string }).id;

  try {
    let stripeCustomerId: string | undefined;
    if (input.donorEmail && !anonymous) {
      stripeCustomerId = await createOrGetStripeCustomer({
        email: input.donorEmail,
        name: input.donorName,
        churchId,
      });
    }
    const pi = await createPaymentIntent({
      amountCents: input.amountCents,
      fundDesignation: input.fundDesignation,
      stripeCustomerId,
      donorEmail: anonymous ? undefined : input.donorEmail,
      donorName: anonymous ? undefined : input.donorName,
      churchId,
      donationId,
    });
    const { error: linkError } = await supabase
      .from("donations")
      .update({ stripe_payment_intent_id: pi.paymentIntentId, stripe_customer_id: stripeCustomerId ?? null })
      .eq("id", donationId)
      .eq("church_id", churchId);
    if (linkError) throw new Error(linkError.message);
    return { ok: true, clientSecret: pi.clientSecret, donationId, paymentIntentId: pi.paymentIntentId, isStub: pi.isStub };
  } catch (error) {
    console.error("Failed to start the Stripe payment:", error);
    await supabase
      .from("donations")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", donationId)
      .eq("church_id", churchId);
    return { ok: false, error: "Couldn't start the payment. Please try again." };
  }
}

/**
 * Whether the signed-in person may confirm this gift: it's in their church
 * and, when it names a giver, that's them (Council Review 34). An anonymous
 * gift stores no profile, so knowing both its ids is the proof. A gift that
 * no longer matches (already confirmed, or not this church's) passes here and
 * is then a no-op in the conditional update.
 */
async function ownsPendingGift(
  session: Awaited<ReturnType<typeof requireChurchSession>>,
  donationId: string,
  paymentIntentId: string,
): Promise<boolean> {
  const { data } = await createTenantAdminClient()
    .from("donations")
    .select("profile_id")
    .eq("id", donationId)
    .eq("church_id", session.appContext.church.id)
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle();
  const giver = (data as { profile_id: string | null } | null)?.profile_id ?? null;
  return !giver || giver === session.churchProfileId;
}

/**
 * confirmDonationAction
 *
 * Called after Stripe Elements confirms payment (or right away in stub mode).
 * Marks the row succeeded only when Stripe itself reports the PaymentIntent as
 * succeeded — never on the browser's word — and only from pending, so it's
 * idempotent with the payment_intent.succeeded webhook, which does the same.
 */
export async function confirmDonationAction(
  donationId: string,
  paymentIntentId: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireChurchSession("/app/member");
  const churchId = session.appContext.church.id;

  if (!(await ownsPendingGift(session, donationId, paymentIntentId))) {
    return { ok: false, error: "This gift isn't yours to confirm." };
  }

  let status: string;
  try {
    status = await retrievePaymentIntentStatus(paymentIntentId);
  } catch (error) {
    console.error("Failed to check the payment with Stripe:", error);
    return { ok: false, error: "Couldn't check your payment. Please try again." };
  }
  if (status !== "succeeded") {
    return { ok: false, error: "Your payment hasn't completed yet." };
  }

  const supabase = createTenantAdminClient();
  const { data } = await supabase
    .from("donations")
    .update({ status: "succeeded", updated_at: new Date().toISOString() })
    .eq("id", donationId)
    .eq("church_id", churchId)
    .eq("stripe_payment_intent_id", paymentIntentId)
    .eq("status", "pending")
    .select("donor_email, donor_name, amount_cents, fund_designation");
  // No row: already confirmed (by the webhook) or not this church's — nothing to do.
  const row = (data as Array<{
    donor_email: string | null;
    donor_name: string | null;
    amount_cents: number;
    fund_designation: string | null;
  }> | null)?.[0];
  if (row) {
    // This call won the pending → succeeded update, so it posts the gift to
    // the ledger and sends the receipt; the webhook won't (Council Review 22).
    await postDonationToGl(supabase, donationId, churchId, row.amount_cents, row.fund_designation);
    if (row.donor_email) {
      await sendDonationReceipt({
        to: row.donor_email,
        donorName: row.donor_name,
        amountCents: row.amount_cents,
        fundDesignation: row.fund_designation,
        donationId,
        churchName: session.appContext.church.name,
      });
      await supabase
        .from("donations")
        .update({ receipt_sent_at: new Date().toISOString() })
        .eq("id", donationId)
        .eq("church_id", churchId);
    }
  }
  revalidatePath("/app/member/giving");
  return { ok: true };
}

/**
 * cancelPendingDonationAction
 *
 * The member closed the card form without paying (G3.0): cancel the
 * PaymentIntent at Stripe and mark the gift cancelled, instead of leaving
 * both open forever. Ownership is the pair of ids the member's own browser was
 * given — an anonymous gift stores no profile to check — and only a gift
 * that's still pending, in this church, can be cancelled. If Stripe reports
 * the payment already succeeded or is processing, nothing is cancelled: the
 * webhook will record it.
 */
export async function cancelPendingDonationAction(
  donationId: string,
  paymentIntentId: string,
): Promise<{ ok: boolean; cancelled: boolean; error?: string }> {
  const session = await requireChurchSession("/app/member");
  const churchId = session.appContext.church.id;
  const supabase = createTenantAdminClient();

  const { data: pending, error: readError } = await supabase
    .from("donations")
    .select("id, profile_id")
    .eq("id", donationId)
    .eq("church_id", churchId)
    .eq("stripe_payment_intent_id", paymentIntentId)
    .eq("status", "pending")
    .maybeSingle();
  if (readError) {
    console.error("Failed to read the pending gift:", readError.message);
    return { ok: false, cancelled: false, error: "Couldn't cancel the gift. Please try again." };
  }
  if (!pending) return { ok: true, cancelled: false };
  // A named gift is cancelled only by its giver (Council Review 34); an
  // anonymous one stores no profile, so the two ids are the proof.
  const giver = (pending as { profile_id: string | null }).profile_id;
  if (giver && giver !== session.churchProfileId) {
    return { ok: false, cancelled: false, error: "This gift isn't yours to cancel." };
  }

  let stripeStatus: string;
  try {
    stripeStatus = await cancelPaymentIntent(paymentIntentId);
  } catch (error) {
    console.error("Failed to cancel the Stripe payment:", error);
    return { ok: false, cancelled: false, error: "Couldn't cancel the gift. Please try again." };
  }
  if (stripeStatus !== "canceled") {
    // Paid (or paying) after all: leave it for the webhook.
    return { ok: true, cancelled: false };
  }

  const { error: updateError } = await supabase
    .from("donations")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", donationId)
    .eq("church_id", churchId)
    .eq("status", "pending");
  if (updateError) {
    console.error("Failed to mark the gift cancelled:", updateError.message);
    return { ok: false, cancelled: false, error: "Couldn't cancel the gift. Please try again." };
  }
  revalidatePath("/app/member/giving");
  return { ok: true, cancelled: true };
}

/**
 * cancelRecurringDonationAction
 *
 * Cancels the member's own recurring gift: the Stripe subscription, then the
 * row. Refuses anyone else's.
 */
export async function cancelRecurringDonationAction(
  donationId: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireChurchSession("/app/member");
  const churchId = session.appContext.church.id;
  const profileId = session.churchProfileId;
  if (!profileId) return { ok: false, error: "Your account has no profile in this church." };

  const supabase = createTenantAdminClient();
  const { data } = await supabase
    .from("donations")
    .select("stripe_subscription_id")
    .eq("id", donationId)
    .eq("church_id", churchId)
    .eq("profile_id", profileId)
    .maybeSingle();
  if (!data) return { ok: false, error: "That gift isn't yours to cancel." };

  const subscriptionId = (data as { stripe_subscription_id: string | null }).stripe_subscription_id;
  if (subscriptionId) await cancelStripeSubscription(subscriptionId);

  const { error } = await supabase
    .from("donations")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", donationId)
    .eq("church_id", churchId)
    .eq("profile_id", profileId);
  if (error) {
    console.error("Failed to mark the recurring gift cancelled:", error.message);
    return { ok: false, error: "Your recurring gift was stopped, but we couldn't update your records. Please contact the church office." };
  }
  revalidatePath("/app/member/giving");
  return { ok: true };
}
