import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";

import {
  createTenantAdminClient,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";
import { getStripeWebhookSecret } from "@/lib/stripe/client";
import { reverseGlEntryForRefund } from "@/lib/stripe/event-registrations";
import { sendEmail } from "@/lib/notifications/send-email";

// ── Signature verification ────────────────────────────────────

function verifyStripeSignature(
  payload: string,
  sigHeader: string,
  secret: string,
): boolean {
  // Stripe-Signature: t=timestamp,v1=hash[,v1=hash...]
  const parts = sigHeader.split(",");
  const tPart = parts.find((p) => p.startsWith("t="));
  const v1Parts = parts.filter((p) => p.startsWith("v1="));

  if (!tPart || v1Parts.length === 0) return false;

  const timestamp = tPart.slice(2);
  const signedPayload = `${timestamp}.${payload}`;
  const expected = createHmac("sha256", secret)
    .update(signedPayload, "utf8")
    .digest("hex");

  return v1Parts.some((v) => {
    const received = v.slice(3);
    try {
      return timingSafeEqual(
        Buffer.from(expected, "hex"),
        Buffer.from(received, "hex"),
      );
    } catch {
      return false;
    }
  });
}

// ── Core donation-succeeded handler ──────────────────────────

async function handlePaymentIntentSucceeded(pi: {
  id: string;
  amount: number;
  currency: string;
  metadata?: {
    church_id?: string;
    fund_designation?: string;
    event_registration_id?: string;
    registration_id?: string;
  };
  receipt_email?: string;
  customer?: string;
}) {
  const churchId = pi.metadata?.church_id;
  if (!churchId) return;

  const registrationId =
    pi.metadata?.event_registration_id ?? pi.metadata?.registration_id;

  if (shouldUseLocalTenantFallback()) {
    const resolvedRegistrationId = registrationId ?? await resolveRegistrationIdFromPaymentIntent(
      pi.id,
      churchId,
    );

    if (resolvedRegistrationId) {
      await queryTenantLocalDb(
        `update public.event_registrations
         set payment_status = 'paid',
             stripe_payment_intent_id = $3,
             amount_paid_cents = $4,
             updated_at = now()
         where id = $1 and church_id = $2`,
        [resolvedRegistrationId, churchId, pi.id, pi.amount],
      );

      await queryTenantLocalDb(
        `update public.event_registration_payments
         set status = 'succeeded',
             payment_intent_id = $3,
             amount_cents = $4,
             currency = $5,
             failure_code = null,
             failure_message = null,
             reconciled_at = now(),
             updated_at = now()
         where registration_id = $1 and church_id = $2`,
        [resolvedRegistrationId, churchId, pi.id, pi.amount, pi.currency],
      );
    }

    // Mark succeeded
    const result = await queryTenantLocalDb<{
      id: string;
      donor_email: string | null;
      donor_name: string | null;
      amount_cents: number;
      fund_designation: string | null;
    }>(
      `update public.donations
       set status = 'succeeded', updated_at = now()
       where stripe_payment_intent_id = $1 and church_id = $2
         and status = 'pending'
       returning id, donor_email, donor_name, amount_cents, fund_designation`,
      [pi.id, churchId],
    );

    const donation = result.rows[0];
    if (!donation) return; // Already processed or not found

    // Auto-post to GL if fund mapping exists
    await autoPostToGl(donation.id, churchId, donation.amount_cents, donation.fund_designation);

    // Send receipt
    const recipientEmail = donation.donor_email ?? pi.receipt_email;
    if (recipientEmail) {
      await sendReceiptEmail(
        recipientEmail,
        donation.donor_name,
        donation.amount_cents,
        donation.fund_designation,
        donation.id,
      );
      await queryTenantLocalDb(
        `update public.donations set receipt_sent_at = now() where id = $1`,
        [donation.id],
      );
    }
    return;
  }

  // Supabase path
  const supabase = createTenantAdminClient();

  const resolvedRegistrationId =
    registrationId ??
    (await resolveRegistrationIdFromPaymentIntent(pi.id, churchId));

  if (resolvedRegistrationId) {
    await supabase
      .from("event_registrations")
      .update({
        payment_status: "paid",
        stripe_payment_intent_id: pi.id,
        amount_paid_cents: pi.amount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", resolvedRegistrationId)
      .eq("church_id", churchId);

    await supabase
      .from("event_registration_payments")
      .update({
        status: "succeeded",
        payment_intent_id: pi.id,
        amount_cents: pi.amount,
        updated_at: new Date().toISOString(),
      })
      .eq("registration_id", resolvedRegistrationId)
      .eq("church_id", churchId);
  }

  const { data: donation } = await supabase
    .from("donations")
    .update({ status: "succeeded", updated_at: new Date().toISOString() })
    .eq("church_id", churchId)
    .eq("stripe_payment_intent_id", pi.id)
    .eq("status", "pending")
    .select("id, donor_email, donor_name, amount_cents, fund_designation")
    .maybeSingle();

  if (!donation) return;

  // Auto-post to GL via Supabase path (mirrors local autoPostToGl)
  await autoPostToGlSupabase(
    supabase,
    donation.id as string,
    churchId,
    (donation as { amount_cents: number }).amount_cents,
    (donation as { fund_designation: string | null }).fund_designation,
  );

  const d = donation as {
    id: string;
    donor_email: string | null;
    donor_name: string | null;
    amount_cents: number;
    fund_designation: string | null;
  };

  const recipientEmail = d.donor_email ?? pi.receipt_email;
  if (recipientEmail) {
    await sendReceiptEmail(
      recipientEmail,
      d.donor_name,
      d.amount_cents,
      d.fund_designation,
      d.id,
    );
    await supabase
      .from("donations")
      .update({ receipt_sent_at: new Date().toISOString() })
      .eq("id", d.id);
  }
}

async function handlePaymentIntentFailed(pi: {
  id: string;
  metadata?: {
    church_id?: string;
    event_registration_id?: string;
    registration_id?: string;
  };
  last_payment_error?: {
    code?: string;
    message?: string;
  };
}) {
  const churchId = pi.metadata?.church_id;
  if (!churchId) return;

  const registrationId =
    pi.metadata?.event_registration_id ?? pi.metadata?.registration_id;

  if (shouldUseLocalTenantFallback()) {
    const resolvedRegistrationId = registrationId ?? await resolveRegistrationIdFromPaymentIntent(
      pi.id,
      churchId,
    );

    if (resolvedRegistrationId) {
      await queryTenantLocalDb(
        `update public.event_registrations
         set payment_status = 'failed',
             stripe_payment_intent_id = $3,
             updated_at = now()
         where id = $1 and church_id = $2`,
        [resolvedRegistrationId, churchId, pi.id],
      );

      await queryTenantLocalDb(
        `update public.event_registration_payments
         set status = 'failed',
             payment_intent_id = $3,
             failure_code = $4,
             failure_message = $5,
             reconciled_at = now(),
             updated_at = now()
         where registration_id = $1 and church_id = $2`,
        [
          resolvedRegistrationId,
          churchId,
          pi.id,
          pi.last_payment_error?.code ?? null,
          pi.last_payment_error?.message ?? null,
        ],
      );
    }

    await queryTenantLocalDb(
      `update public.donations
       set status = 'failed', updated_at = now()
       where stripe_payment_intent_id = $1 and church_id = $2 and status = 'pending'`,
      [pi.id, churchId],
    );
    return;
  }

  // Supabase path
  const supabase = createTenantAdminClient();

  const resolvedRegistrationId =
    registrationId ??
    (await resolveRegistrationIdFromPaymentIntent(pi.id, churchId));

  if (resolvedRegistrationId) {
    await supabase
      .from("event_registrations")
      .update({
        payment_status: "failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", resolvedRegistrationId)
      .eq("church_id", churchId);

    await supabase
      .from("event_registration_payments")
      .update({
        status: "failed",
        failure_code: pi.last_payment_error?.code ?? null,
        failure_message: pi.last_payment_error?.message ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("registration_id", resolvedRegistrationId)
      .eq("church_id", churchId);
  }

  await supabase
    .from("donations")
    .update({ status: "failed", updated_at: new Date().toISOString() })
    .eq("church_id", churchId)
    .eq("stripe_payment_intent_id", pi.id);
}

async function resolveRegistrationIdFromPaymentIntent(
  paymentIntentId: string,
  churchId: string,
) {
  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{ registration_id: string }>(
      `select registration_id
       from public.event_registration_payments
       where payment_intent_id = $1 and church_id = $2
       limit 1`,
      [paymentIntentId, churchId],
    );

    return result.rows[0]?.registration_id ?? null;
  }

  // Supabase path
  const supabase = createTenantAdminClient();
  const { data } = await supabase
    .from("event_registration_payments")
    .select("registration_id")
    .eq("church_id", churchId)
    .eq("payment_intent_id", paymentIntentId)
    .maybeSingle();
  return (data as { registration_id: string } | null)?.registration_id ?? null;
}

async function handleChargeRefunded(charge: {
  payment_intent: string | null;
  amount: number;
  amount_refunded: number;
  metadata?: {
    church_id?: string;
    event_registration_id?: string;
    registration_id?: string;
  };
  refunds?: {
    data?: Array<{
      id: string;
      amount: number;
    }>;
  };
}) {
  const churchId = charge.metadata?.church_id;
  if (!churchId) {
    console.info("[stripe-webhook] charge.refunded: no church_id in metadata — skipped");
    return;
  }

  const paymentIntentId = charge.payment_intent;
  if (!paymentIntentId) return;

  const registrationId =
    charge.metadata?.event_registration_id ??
    charge.metadata?.registration_id ??
    (await resolveRegistrationIdFromPaymentIntent(paymentIntentId, churchId));

  if (!registrationId) return;

  const refund = charge.refunds?.data?.[0];
  if (!refund) return;

  const refundId = refund.id;
  const refundAmountCents = refund.amount;

  const status =
    charge.amount_refunded >= charge.amount ? "refunded" : "partially_refunded";

  if (shouldUseLocalTenantFallback()) {
    // Idempotency: skip if this refund has already been recorded
    const existing = await queryTenantLocalDb<{ registration_id: string }>(
      `select registration_id
       from public.event_registration_payments
       where refund_id = $1
       limit 1`,
      [refundId],
    );
    if (existing.rows[0]) return;

    await queryTenantLocalDb(
      `update public.event_registrations
       set payment_status = $2,
           updated_at = now()
       where id = $1 and church_id = $3`,
      [registrationId, status, churchId],
    );

    await queryTenantLocalDb(
      `update public.event_registration_payments
       set status = $2,
           refund_id = $3,
           refund_amount_cents = $4,
           refund_completed_at = now(),
           updated_at = now()
       where registration_id = $1 and church_id = $5`,
      [registrationId, status, refundId, refundAmountCents, churchId],
    );

    // GL reversal — best-effort, does not fail the webhook acknowledgement
    try {
      await reverseGlEntryForRefund({
        churchId,
        registrationId,
        amountCents: refundAmountCents,
        refundId,
        refundedAt: new Date().toISOString(),
        profileId: null, // no actor session available in webhook context
      });
    } catch (glErr) {
      console.error("[stripe-webhook] GL reversal failed (non-blocking):", glErr);
    }
    return;
  }

  // Supabase path
  const supabase = createTenantAdminClient();

  // Idempotency: skip if this refund has already been recorded
  const { data: existingRefund } = await supabase
    .from("event_registration_payments")
    .select("id")
    .eq("church_id", churchId)
    .eq("refund_id", refundId)
    .maybeSingle();
  if (existingRefund) return;

  await supabase
    .from("event_registrations")
    .update({
      payment_status: status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", registrationId)
    .eq("church_id", churchId);

  await supabase
    .from("event_registration_payments")
    .update({
      status,
      refund_id: refundId,
      refund_amount_cents: refundAmountCents,
      refund_completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("registration_id", registrationId)
    .eq("church_id", churchId);

  // GL reversal via Supabase path — best-effort, does not fail webhook acknowledgement
  await reverseGlEntryForRefundSupabase(supabase, paymentIntentId, churchId);
}

async function handleSubscriptionDeleted(sub: {
  id: string;
  metadata?: { church_id?: string };
}) {
  const churchId = sub.metadata?.church_id;
  if (!churchId) return;

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `update public.donations
       set status = 'cancelled', updated_at = now()
       where stripe_subscription_id = $1 and church_id = $2`,
      [sub.id, churchId],
    );
    return;
  }

  // Supabase path
  const supabase = createTenantAdminClient();
  await supabase
    .from("donations")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("stripe_subscription_id", sub.id)
    .eq("church_id", churchId);
}

// ── GL auto-post ──────────────────────────────────────────────
// Dead code — Supabase-only architecture (2026-07-10). Use autoPostToGlSupabase.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function autoPostToGl(..._args: unknown[]) { return; }

// ── GL auto-post (Supabase path) ──────────────────────────────

async function autoPostToGlSupabase(
  supabase: ReturnType<typeof createTenantAdminClient>,
  donationId: string,
  churchId: string,
  amountCents: number,
  fundDesignation: string | null,
) {
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

    // Create journal
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
    // Columns: journal_id, church_id, account_id, side ('debit'|'credit'), amount_cents, memo, sort_order
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

    // Audit record
    await supabase.from("donation_gl_posts").insert({
      church_id: churchId,
      donation_id: donationId,
      journal_id: journalId,
      status: "posted",
    });
  } catch (err) {
    console.error("[stripe-webhook] autoPostToGlSupabase failed (non-blocking):", err);
  }
}

async function reverseGlEntryForRefundSupabase(
  supabase: ReturnType<typeof createTenantAdminClient>,
  paymentIntentId: string,
  churchId: string,
) {
  try {
    // Find the donation by payment intent
    const { data: donation } = await supabase
      .from("donations")
      .select("id")
      .eq("church_id", churchId)
      .eq("stripe_payment_intent_id", paymentIntentId)
      .maybeSingle();
    if (!donation) return;

    const donationId = (donation as { id: string }).id;

    // Find the GL post record
    const { data: glPost } = await supabase
      .from("donation_gl_posts")
      .select("journal_id")
      .eq("donation_id", donationId)
      .maybeSingle();
    if (!glPost) return; // No GL post to reverse

    const journalId = (glPost as { journal_id: string | null }).journal_id;
    if (!journalId) return;

    // Void the journal
    await supabase
      .from("finance_journals")
      .update({
        status: "voided",
        voided_at: new Date().toISOString(),
        voided_by: "system-webhook-refund",
      })
      .eq("id", journalId)
      .eq("church_id", churchId);
  } catch (err) {
    console.error("[stripe-webhook] reverseGlEntryForRefundSupabase failed (non-blocking):", err);
  }
}

// ── Receipt email ─────────────────────────────────────────────

async function sendReceiptEmail(
  to: string,
  donorName: string | null,
  amountCents: number,
  fundDesignation: string | null,
  donationId: string,
) {
  const amount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amountCents / 100);

  const fund = fundDesignation ?? "General Fund";
  const name = donorName ? `${donorName}, thank` : "Thank";

  await sendEmail({
    to,
    subject: `Your gift of ${amount} — receipt`,
    text: `${name} you for your gift of ${amount} to ${fund}. Donation ID: ${donationId}`,
    html: `
      <p>${name} you for your generous gift of <strong>${amount}</strong> to the <strong>${fund}</strong>.</p>
      <p>Donation reference: <code>${donationId.slice(-8).toUpperCase()}</code></p>
      <p style="color:#666;font-size:12px">This is your official giving receipt. Please retain for tax purposes.</p>
    `,
    idempotencyKey: donationId,
  });
}

// ── Route handler ─────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  const webhookSecret = getStripeWebhookSecret();

  // Read raw body as text (required for signature verification)
  const rawBody = await req.text();
  const sigHeader = req.headers.get("stripe-signature") ?? "";

  // Verify signature when secret is configured
  if (webhookSecret) {
    if (!verifyStripeSignature(rawBody, sigHeader, webhookSecret)) {
      console.warn("[stripe-webhook] Invalid signature — rejected");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  let event: { type: string; data: { object: Record<string, unknown> } };
  try {
    event = JSON.parse(rawBody) as typeof event;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "payment_intent.succeeded":
        await handlePaymentIntentSucceeded(
          event.data.object as Parameters<typeof handlePaymentIntentSucceeded>[0],
        );
        break;

      case "payment_intent.payment_failed":
        await handlePaymentIntentFailed(
          event.data.object as Parameters<typeof handlePaymentIntentFailed>[0],
        );
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(
          event.data.object as Parameters<typeof handleSubscriptionDeleted>[0],
        );
        break;

      case "charge.refunded":
        await handleChargeRefunded(
          event.data.object as Parameters<typeof handleChargeRefunded>[0],
        );
        break;

      default:
        // Unhandled event type — acknowledge and ignore
        break;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[stripe-webhook] Handler error:", msg);
    // Return 200 so Stripe does not retry — log for investigation
    return NextResponse.json({ received: true, warning: msg });
  }

  return NextResponse.json({ received: true });
}
