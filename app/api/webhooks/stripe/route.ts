import { NextRequest, NextResponse } from "next/server";

import {
  createTenantAdminClient,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";
import { getStripeWebhookSecret } from "@/lib/stripe/client";
import {
  churchForStripeAccount,
  markChurchStripeAccountDisconnected,
  updateChurchStripeAccountStatus,
} from "@/lib/stripe/connect";
import { verifyStripeSignature } from "@/lib/stripe/webhook-signature";
import { reverseGlEntryForRefund } from "@/lib/stripe/event-registrations";
import { completeDonation, sendDonationReceipt } from "@/lib/stripe/donation-completion";
import {
  handleInvoicePaid,
  handleInvoicePaymentFailed,
  syncRecurringGiftFromSubscription,
  type StripeInvoice,
  type StripeSubscriptionEvent,
} from "@/lib/stripe/recurring-webhooks";


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
      await sendDonationReceipt({
        to: recipientEmail,
        donorName: donation.donor_name,
        amountCents: donation.amount_cents,
        fundDesignation: donation.fund_designation,
        donationId: donation.id,
      });
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
    // event_registrations has no updated_at column: writing one failed this
    // update, unchecked, so a paid registration never became paid (S4).
    const { error: registrationError } = await supabase
      .from("event_registrations")
      .update({
        payment_status: "paid",
        stripe_payment_intent_id: pi.id,
        amount_paid_cents: pi.amount,
      })
      .eq("id", resolvedRegistrationId)
      .eq("church_id", churchId);
    if (registrationError) throw new Error(registrationError.message);

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

  // The gift (one-time, or a recurring installment already recorded by
  // invoice.paid): marked succeeded, posted, receipted, then completed.
  // Retry-safe: a failure throws, the route answers 5xx, Stripe retries, and
  // the gift resumes where it stopped (G3.2).
  await completeDonation(supabase, churchId, { paymentIntentId: pi.id }, { receiptEmailFallback: pi.receipt_email ?? null });
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
    const { error: registrationError } = await supabase
      .from("event_registrations")
      .update({ payment_status: "failed" })
      .eq("id", resolvedRegistrationId)
      .eq("church_id", churchId);
    if (registrationError) throw new Error(registrationError.message);

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

  const { error: registrationError } = await supabase
    .from("event_registrations")
    .update({ payment_status: status })
    .eq("id", registrationId)
    .eq("church_id", churchId);
  if (registrationError) throw new Error(registrationError.message);

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

  // Supabase path. Only a legacy, still-unpaid gift row is cancelled: a
  // recurring gift's installments are payments that happened, and stay so
  // (PR #177 review). The recurring gift itself is cancelled by
  // syncSubscription.
  const supabase = createTenantAdminClient();
  const { error } = await supabase
    .from("donations")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("stripe_subscription_id", sub.id)
    .eq("church_id", churchId)
    .eq("status", "pending")
    .is("recurring_gift_id", null);
  if (error) throw new Error(error.message);
}

/** Keeps a recurring gift in step with its subscription (G3.2). */
async function syncSubscription(
  event: { created?: number },
  subscription: StripeSubscriptionEvent & { metadata?: { church_id?: string } },
) {
  const churchId = subscription.metadata?.church_id;
  if (!churchId) return;
  await syncRecurringGiftFromSubscription(createTenantAdminClient(), churchId, subscription, event.created);
}

// ── GL auto-post ──────────────────────────────────────────────
// Dead code — Supabase-only architecture (2026-07-10). Use postDonationToGl.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function autoPostToGl(..._args: unknown[]) { return; }

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

// ── Route handler ─────────────────────────────────────────────

/**
 * A connected (church) account's event (ADR 0025): resolve the church from
 * `event.account`, and refuse an event whose payment names another church.
 * The church fills in metadata the object lacks (a Charge doesn't copy its
 * PaymentIntent's), so the handlers below find it the same way as before.
 * Returns false when the event must be ignored.
 */
async function scopeConnectedEvent(event: {
  account?: string;
  created?: number;
  type: string;
  data: { object: Record<string, unknown> };
}): Promise<boolean> {
  const account = event.account;
  if (!account) return true;
  // Stripe doesn't deliver events in order: an account event from before the
  // church's current connection (a retried deauthorization, say) must not
  // change the new link (PR #174 review).
  const asOf = typeof event.created === "number" ? new Date(event.created * 1000) : undefined;

  if (event.type === "account.application.deauthorized") {
    // The church revoked ChurchCore's access in Stripe.
    await markChurchStripeAccountDisconnected(account, asOf);
    return false;
  }
  if (event.type === "account.updated") {
    const object = event.data.object as { charges_enabled?: boolean; details_submitted?: boolean };
    await updateChurchStripeAccountStatus(
      account,
      {
        chargesEnabled: Boolean(object.charges_enabled),
        detailsSubmitted: Boolean(object.details_submitted),
      },
      asOf,
    );
    return false;
  }

  const churchId = await churchForStripeAccount(account);
  if (!churchId) {
    console.warn("[stripe-webhook] Event from an account no church has connected — ignored:", event.type);
    return false;
  }
  const object = event.data.object as { metadata?: Record<string, string> };
  const named = object.metadata?.church_id;
  if (named && named !== churchId) {
    console.error("[stripe-webhook] Event's church doesn't match its connected account — ignored:", event.type);
    return false;
  }
  object.metadata = { ...object.metadata, church_id: churchId };
  return true;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const webhookSecret = getStripeWebhookSecret();
  // Events from connected church accounts come from Stripe's Connect
  // endpoint, signed with its own secret (ADR 0025).
  const connectWebhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET?.trim() || null;

  // Read raw body as text (required for signature verification)
  const rawBody = await req.text();
  const sigHeader = req.headers.get("stripe-signature") ?? "";

  // Fail closed: with no secret every event is rejected, in every
  // environment. Before S2 an unset secret accepted anything, so anyone could
  // post a "payment succeeded" event.
  if (!webhookSecret) {
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET is not set — rejecting webhook (S2).");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  if (
    !verifyStripeSignature(rawBody, sigHeader, webhookSecret) &&
    !(connectWebhookSecret && verifyStripeSignature(rawBody, sigHeader, connectWebhookSecret))
  ) {
    console.warn("[stripe-webhook] Invalid or expired signature — rejected");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: { type: string; account?: string; created?: number; data: { object: Record<string, unknown> } };
  try {
    event = JSON.parse(rawBody) as typeof event;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    if (!(await scopeConnectedEvent(event))) {
      return NextResponse.json({ received: true });
    }

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
        await syncSubscription(event, { ...(event.data.object as StripeSubscriptionEvent), status: "canceled" });
        break;

      case "customer.subscription.updated":
        await syncSubscription(event, event.data.object as StripeSubscriptionEvent);
        break;

      case "invoice.paid":
      case "invoice.payment_failed": {
        const invoice = event.data.object as StripeInvoice & { metadata?: { church_id?: string } };
        const churchId = invoice.metadata?.church_id;
        if (!churchId) break;
        const supabase = createTenantAdminClient();
        if (event.type === "invoice.paid") await handleInvoicePaid(supabase, churchId, invoice);
        else await handleInvoicePaymentFailed(supabase, churchId, invoice);
        break;
      }

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
    // 5xx so Stripe retries: every handler is repeatable, and a gift's
    // completion marker is written last, so a retry resumes where this
    // attempt stopped (G3.2). Before, a 200 here meant a failed ledger post
    // or receipt was never retried.
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
