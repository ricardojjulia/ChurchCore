"use server";

import { revalidatePath } from "next/cache";

import { requireChurchSession } from "@/lib/auth";
import {
  createPaymentIntent,
  createOrGetStripeCustomer,
  cancelStripeSubscription,
} from "@/lib/stripe/donations";
import {
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
  createTenantServerClient,
} from "@/lib/supabase/tenant";
import { sendEmail } from "@/lib/notifications/send-email";

// ── Types ────────────────────────────────────────────────────

export interface InitiateDonationInput {
  amountCents: number;
  fundDesignation?: string;
  isAnonymous?: boolean;
  note?: string;
  donorName?: string;
  donorEmail?: string;
}

export interface InitiateDonationResult {
  /** Stripe PaymentIntent client_secret — pass to Stripe Elements. */
  clientSecret: string;
  /** Our donations row id — pass back to confirmDonationAction. */
  donationId: string;
  isStub: boolean;
}

/**
 * initiateDonationAction
 *
 * Creates a Stripe PaymentIntent and a pending donations row.
 * The client calls stripe.confirmPayment() then calls
 * confirmDonationAction to mark it succeeded.
 *
 * All giving is 100% voluntary — no minimum, no platform fee.
 */
export async function initiateDonationAction(
  input: InitiateDonationInput,
): Promise<InitiateDonationResult> {
  const session = await requireChurchSession("/app/member");
  const churchId = session.appContext.church.id;
  const profileId = session.profile.id;

  // Get or create Stripe customer if donor email provided
  let stripeCustomerId: string | undefined;
  if (input.donorEmail && !input.isAnonymous) {
    stripeCustomerId = await createOrGetStripeCustomer({
      email: input.donorEmail,
      name: input.donorName,
      churchId,
    });
  }

  const piResult = await createPaymentIntent({
    amountCents: input.amountCents,
    fundDesignation: input.fundDesignation,
    stripeCustomerId,
    donorEmail: input.isAnonymous ? undefined : input.donorEmail,
    donorName: input.isAnonymous ? undefined : input.donorName,
    churchId,
  });

  // Insert pending donations row
  let donationId: string;

  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{ id: string }>(
      `insert into public.donations
         (church_id, profile_id, donor_name, donor_email, amount_cents,
          fund_designation, stripe_payment_intent_id, stripe_customer_id,
          is_recurring, is_anonymous, status, note)
       values ($1,$2,$3,$4,$5,$6,$7,$8,false,$9,'pending',$10)
       returning id`,
      [
        churchId,
        input.isAnonymous ? null : profileId,
        input.isAnonymous ? null : (input.donorName ?? null),
        input.isAnonymous ? null : (input.donorEmail ?? null),
        input.amountCents,
        input.fundDesignation ?? null,
        piResult.paymentIntentId,
        stripeCustomerId ?? null,
        input.isAnonymous ?? false,
        input.note ?? null,
      ],
    );
    donationId = result.rows[0].id;
  } else {
    const supabase = await createTenantServerClient();
    const { data } = await supabase
      .from("donations")
      .insert({
        church_id: churchId,
        profile_id: input.isAnonymous ? null : profileId,
        donor_name: input.isAnonymous ? null : (input.donorName ?? null),
        donor_email: input.isAnonymous ? null : (input.donorEmail ?? null),
        amount_cents: input.amountCents,
        fund_designation: input.fundDesignation ?? null,
        stripe_payment_intent_id: piResult.paymentIntentId,
        stripe_customer_id: stripeCustomerId ?? null,
        is_anonymous: input.isAnonymous ?? false,
        status: "pending",
        note: input.note ?? null,
      })
      .select("id")
      .single();
    donationId = (data as { id: string }).id;
  }

  return {
    clientSecret: piResult.clientSecret,
    donationId,
    isStub: piResult.isStub,
  };
}

/**
 * confirmDonationAction
 *
 * Called after Stripe Elements confirms payment.
 * Marks the donations row as succeeded and sends a receipt.
 */
export async function confirmDonationAction(
  donationId: string,
  paymentIntentId: string,
): Promise<void> {
  const session = await requireChurchSession("/app/member");
  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `update public.donations
       set status = 'succeeded', updated_at = now()
       where id = $1 and church_id = $2 and stripe_payment_intent_id = $3`,
      [donationId, churchId, paymentIntentId],
    );
    // Fetch for receipt
    const row = await queryTenantLocalDb<{
      donor_email: string | null;
      donor_name: string | null;
      amount_cents: number;
      fund_designation: string | null;
    }>(
      `select donor_email, donor_name, amount_cents, fund_designation
       from public.donations where id = $1`,
      [donationId],
    );
    if (row.rows[0]?.donor_email) {
      await sendReceiptEmail(
        row.rows[0].donor_email,
        row.rows[0].donor_name,
        row.rows[0].amount_cents,
        row.rows[0].fund_designation,
        session.appContext.church.name,
        donationId,
      );
      await queryTenantLocalDb(
        `update public.donations set receipt_sent_at = now() where id = $1`,
        [donationId],
      );
    }
  } else {
    const supabase = await createTenantServerClient();
    const { data } = await supabase
      .from("donations")
      .update({ status: "succeeded", updated_at: new Date().toISOString() })
      .eq("id", donationId)
      .eq("church_id", churchId)
      .eq("stripe_payment_intent_id", paymentIntentId)
      .select("donor_email, donor_name, amount_cents, fund_designation")
      .single();

    const row = data as {
      donor_email?: string;
      donor_name?: string;
      amount_cents: number;
      fund_designation?: string;
    } | null;

    if (row?.donor_email) {
      await sendReceiptEmail(
        row.donor_email,
        row.donor_name ?? null,
        row.amount_cents,
        row.fund_designation ?? null,
        session.appContext.church.name,
        donationId,
      );
      await supabase
        .from("donations")
        .update({ receipt_sent_at: new Date().toISOString() })
        .eq("id", donationId);
    }
  }

  revalidatePath("/app/member/giving");
}

/**
 * cancelRecurringDonationAction
 *
 * Cancels a Stripe subscription and marks the donations row cancelled.
 */
export async function cancelRecurringDonationAction(
  donationId: string,
): Promise<void> {
  const session = await requireChurchSession("/app/member");
  const churchId = session.appContext.church.id;

  // Fetch subscription id
  let subscriptionId: string | null = null;

  if (shouldUseLocalTenantFallback()) {
    const row = await queryTenantLocalDb<{ stripe_subscription_id: string | null }>(
      `select stripe_subscription_id from public.donations
       where id = $1 and church_id = $2 and profile_id = (
         select id from public.profiles where user_id = $3 limit 1
       )`,
      [donationId, churchId, session.userId],
    );
    subscriptionId = row.rows[0]?.stripe_subscription_id ?? null;
  } else {
    const supabase = await createTenantServerClient();
    const { data } = await supabase
      .from("donations")
      .select("stripe_subscription_id")
      .eq("id", donationId)
      .eq("church_id", churchId)
      .single();
    subscriptionId = (data as { stripe_subscription_id?: string } | null)
      ?.stripe_subscription_id ?? null;
  }

  if (subscriptionId) {
    await cancelStripeSubscription(subscriptionId);
  }

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `update public.donations set status = 'cancelled', updated_at = now() where id = $1`,
      [donationId],
    );
  } else {
    const supabase = await createTenantServerClient();
    await supabase
      .from("donations")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", donationId);
  }

  revalidatePath("/app/member/giving");
}

// ── Private helpers ───────────────────────────────────────────

async function sendReceiptEmail(
  to: string,
  name: string | null,
  amountCents: number,
  fund: string | null,
  churchName: string,
  donationId: string,
): Promise<void> {
  const dollars = (amountCents / 100).toFixed(2);
  const fundLabel = fund ?? "General Fund";
  const greeting = name ? `Dear ${name},` : "Dear Friend,";

  await sendEmail({
    to,
    subject: `Thank you for your gift to ${churchName}`,
    text: [
      greeting,
      "",
      `Thank you for your generous and voluntary gift of $${dollars} to the ${fundLabel} at ${churchName}.`,
      "",
      "Your giving makes a difference in our community. We are grateful for your generosity.",
      "",
      `Donation reference: ${donationId}`,
      "",
      "This receipt is for your records. Please retain it for tax purposes.",
      "",
      `With gratitude,`,
      churchName,
    ].join("\n"),
    html: `
      <p>${greeting}</p>
      <p>Thank you for your generous and voluntary gift of <strong>$${dollars}</strong> to the <strong>${fundLabel}</strong> at ${churchName}.</p>
      <p>Your giving makes a difference in our community. We are grateful for your generosity.</p>
      <p style="color:#666;font-size:12px;">Donation reference: ${donationId}</p>
      <p style="color:#666;font-size:12px;">This receipt is for your records. Please retain it for tax purposes.</p>
      <p>With gratitude,<br/>${churchName}</p>
    `,
    idempotencyKey: donationId,
  });
}
