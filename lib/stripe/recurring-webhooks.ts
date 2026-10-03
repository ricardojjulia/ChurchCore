import "server-only";

import { sendEmail } from "@/lib/notifications/send-email";
import type { createTenantAdminClient } from "@/lib/supabase/tenant";

import { completeDonation, escapeHtml, RECEIPT_LEASE_MS } from "./donation-completion";
import { recurringStatusFromStripe } from "./recurring";

// Stripe webhooks for recurring gifts (G3.2). Each installment (invoice)
// becomes a donation, keyed by its invoice id; subscription events keep
// the recurring gift in step with Stripe. Every handler can be repeated,
// and throws on failure so the route answers 5xx and Stripe retries.
// `churchId` comes from the event's connected account (scopeConnectedEvent).

type AdminClient = ReturnType<typeof createTenantAdminClient>;

export type StripeInvoice = {
  id: string;
  subscription?: string | null;
  amount_paid?: number;
  amount_due?: number;
  currency?: string;
  payment_intent?: string | null;
  customer?: string | null;
  lines?: { data?: Array<{ period?: { end?: number } }> };
  status_transitions?: { paid_at?: number | null };
};

export type StripeSubscriptionEvent = {
  id: string;
  status: string;
  pause_collection?: { behavior?: string } | null;
  current_period_end?: number | null;
  trial_end?: number | null;
};

type GiftRow = {
  id: string;
  profile_id: string | null;
  fund_designation: string | null;
  is_anonymous: boolean;
  status: string;
  stripe_account_id: string | null;
  stripe_customer_id: string | null;
};

async function giftForSubscription(supabase: AdminClient, churchId: string, subscriptionId: string): Promise<GiftRow | null> {
  const { data, error } = await supabase
    .from("recurring_gifts")
    .select("id, profile_id, fund_designation, is_anonymous, status, stripe_account_id, stripe_customer_id")
    .eq("church_id", churchId)
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as GiftRow | null) ?? null;
}

async function donor(supabase: AdminClient, churchId: string, profileId: string | null) {
  if (!profileId) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", profileId)
    .eq("church_id", churchId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as { full_name: string | null; email: string | null } | null;
}

/** Writes the installment's donation once (keyed by invoice id); a retry finds it. */
async function recordInstallment(
  supabase: AdminClient,
  churchId: string,
  gift: GiftRow,
  invoice: StripeInvoice,
  status: "pending" | "failed",
  amountCents: number,
  person: { full_name: string | null; email: string | null } | null,
) {
  const { error } = await supabase.from("donations").upsert(
    {
      church_id: churchId,
      // An anonymous gift stays unlinked from the giver, as one-time
      // anonymous gifts do; its receipt still reaches them privately.
      profile_id: gift.is_anonymous ? null : gift.profile_id,
      donor_name: gift.is_anonymous ? null : (person?.full_name ?? null),
      donor_email: gift.is_anonymous ? null : (person?.email ?? null),
      amount_cents: amountCents,
      currency: invoice.currency ?? "usd",
      fund_designation: gift.fund_designation,
      is_recurring: true,
      is_anonymous: gift.is_anonymous,
      recurring_gift_id: gift.id,
      stripe_subscription_id: invoice.subscription,
      stripe_invoice_id: invoice.id,
      stripe_payment_intent_id: invoice.payment_intent ?? null,
      stripe_customer_id: invoice.customer ?? gift.stripe_customer_id,
      stripe_account_id: gift.stripe_account_id,
      status,
    },
    { onConflict: "stripe_invoice_id", ignoreDuplicates: true },
  );
  if (error) throw new Error(error.message);
}

/**
 * invoice.paid: records the installment as a donation and completes it
 * (ledger, receipt, completion marker), then moves the gift on. A $0
 * invoice (the start of a future-dated gift's trial) records nothing.
 */
export async function handleInvoicePaid(supabase: AdminClient, churchId: string, invoice: StripeInvoice): Promise<void> {
  const amountCents = invoice.amount_paid ?? 0;
  if (!invoice.subscription || amountCents <= 0) return;
  const gift = await giftForSubscription(supabase, churchId, invoice.subscription);
  if (!gift) return; // Not a ChurchCore recurring gift.

  const person = await donor(supabase, churchId, gift.profile_id);
  await recordInstallment(supabase, churchId, gift, invoice, "pending", amountCents, person);
  await completeDonation(supabase, churchId, { invoiceId: invoice.id }, { receiptEmailFallback: person?.email ?? null });

  // Payment dates only move forward, from Stripe's own times, never the
  // delivery time: a replayed older invoice can't move the next date back,
  // and a cancelled gift gets no next date (PR #177 review).
  const paidAt = new Date((invoice.status_transitions?.paid_at ?? Math.floor(Date.now() / 1000)) * 1000).toISOString();
  const { error: paidError } = await supabase
    .from("recurring_gifts")
    .update({ last_payment_at: paidAt, updated_at: new Date().toISOString() })
    .eq("id", gift.id)
    .eq("church_id", churchId)
    .or(`last_payment_at.is.null,last_payment_at.lt."${paidAt}"`);
  if (paidError) throw new Error(paidError.message);

  const periodEnd = invoice.lines?.data?.[0]?.period?.end;
  if (periodEnd) {
    const nextAt = new Date(periodEnd * 1000).toISOString();
    const { error: nextError } = await supabase
      .from("recurring_gifts")
      .update({ next_payment_at: nextAt })
      .eq("id", gift.id)
      .eq("church_id", churchId)
      .neq("status", "cancelled")
      .or(`next_payment_at.is.null,next_payment_at.lt."${nextAt}"`);
    if (nextError) throw new Error(nextError.message);
  }

  // A paid installment brings a gift that was waiting on its card, or
  // behind on a payment, back to active; paused and cancelled stay so.
  const { error: statusError } = await supabase
    .from("recurring_gifts")
    .update({ status: "active" })
    .eq("id", gift.id)
    .eq("church_id", churchId)
    .in("status", ["incomplete", "past_due"]);
  if (statusError) throw new Error(statusError.message);
}

/**
 * invoice.payment_failed: records the failed installment, tells the donor
 * once (Stripe retries the charge itself), and marks the gift past due.
 */
export async function handleInvoicePaymentFailed(supabase: AdminClient, churchId: string, invoice: StripeInvoice): Promise<void> {
  const amountCents = invoice.amount_due ?? 0;
  if (!invoice.subscription || amountCents <= 0) return;
  const gift = await giftForSubscription(supabase, churchId, invoice.subscription);
  // A gift never set up (the member left the card step) or since cancelled
  // has no installment to fail: no record, and no email about it.
  if (!gift || gift.status === "incomplete" || gift.status === "cancelled") return;

  const person = await donor(supabase, churchId, gift.profile_id);
  await recordInstallment(supabase, churchId, gift, invoice, "failed", amountCents, person);

  // A failure delivered after this invoice was paid (Stripe doesn't deliver
  // in order) changes nothing: the payment stands, and so does the gift
  // (PR #177 review).
  const { data: installment, error: readError } = await supabase
    .from("donations")
    .select("status, failure_notice_sent_at")
    .eq("church_id", churchId)
    .eq("stripe_invoice_id", invoice.id)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  const row = installment as { status: string; failure_notice_sent_at: string | null } | null;
  if (!row || row.status !== "failed") return;

  if (person?.email && !row.failure_notice_sent_at) {
    // Claimed with a lease while sending, marked sent once the provider
    // accepted it, so neither a refusal nor a thrown send nor a stopped
    // worker can lose the notice (PR #177 review).
    const staleBefore = new Date(Date.now() - RECEIPT_LEASE_MS).toISOString();
    const { data: claimed, error: claimError } = await supabase
      .from("donations")
      .update({ failure_notice_claimed_at: new Date().toISOString() })
      .eq("church_id", churchId)
      .eq("stripe_invoice_id", invoice.id)
      .is("failure_notice_sent_at", null)
      .or(`failure_notice_claimed_at.is.null,failure_notice_claimed_at.lt."${staleBefore}"`)
      .select("id");
    if (claimError) throw new Error(claimError.message);
    if (!claimed?.length) throw new Error("Another attempt is sending this failure notice; retry later.");

    const release = () =>
      supabase.from("donations").update({ failure_notice_claimed_at: null }).eq("church_id", churchId).eq("stripe_invoice_id", invoice.id);
    const { data: church } = await supabase.from("churches").select("name").eq("id", churchId).maybeSingle();
    const churchName = (church as { name: string } | null)?.name ?? "your church";
    const dollars = (amountCents / 100).toFixed(2);
    let sent: Awaited<ReturnType<typeof sendEmail>>;
    try {
      sent = await sendEmail({
        to: person.email,
        subject: `Your recurring gift to ${churchName} couldn't be processed`,
        text: [
          person.full_name ? `Dear ${person.full_name},` : "Dear Friend,",
          "",
          `We couldn't process this installment of your recurring gift of $${dollars} to ${churchName}. Stripe will try again over the next few days.`,
          "",
          "If your card has changed or expired, please contact your bank or the church office. You can pause or cancel the gift any time from your giving page.",
        ].join("\n"),
        html: `<p>${escapeHtml(person.full_name ? `Dear ${person.full_name},` : "Dear Friend,")}</p>
<p>We couldn't process this installment of your recurring gift of <strong>$${dollars}</strong> to ${escapeHtml(churchName)}. Stripe will try again over the next few days.</p>
<p>If your card has changed or expired, please contact your bank or the church office. You can pause or cancel the gift any time from your giving page.</p>`,
        idempotencyKey: `recurring-failed-${invoice.id}`,
      });
    } catch (sendError) {
      await release();
      throw sendError;
    }
    if (!sent.accepted) {
      await release();
      throw new Error(`Failure notice refused: ${sent.error ?? "unknown error"}`);
    }
    const { error: sentError } = await supabase
      .from("donations")
      .update({ failure_notice_sent_at: new Date().toISOString() })
      .eq("church_id", churchId)
      .eq("stripe_invoice_id", invoice.id);
    if (sentError) throw new Error(sentError.message);
  }

  const { error } = await supabase
    .from("recurring_gifts")
    .update({ status: "past_due", updated_at: new Date().toISOString() })
    .eq("id", gift.id)
    .eq("church_id", churchId)
    .eq("status", "active");
  if (error) throw new Error(error.message);
}

/**
 * customer.subscription.updated / .deleted: brings the gift's status and
 * next payment in line with Stripe. Stripe doesn't deliver events in order,
 * so an event older than the last one applied is ignored, and a cancelled
 * gift never comes back.
 */
export async function syncRecurringGiftFromSubscription(
  supabase: AdminClient,
  churchId: string,
  subscription: StripeSubscriptionEvent,
  eventCreated: number | undefined,
): Promise<void> {
  const status = recurringStatusFromStripe(subscription.status, Boolean(subscription.pause_collection?.behavior));
  const nextUnix = subscription.status === "trialing" ? subscription.trial_end : subscription.current_period_end;
  const eventAt = new Date((eventCreated ?? Math.floor(Date.now() / 1000)) * 1000).toISOString();
  const now = new Date().toISOString();

  let query = supabase
    .from("recurring_gifts")
    .update({
      status,
      next_payment_at: status === "cancelled" ? null : nextUnix ? new Date(nextUnix * 1000).toISOString() : null,
      stripe_event_at: eventAt,
      ...(status === "cancelled" ? { cancelled_at: now } : {}),
      updated_at: now,
    })
    .eq("church_id", churchId)
    .eq("stripe_subscription_id", subscription.id)
    // Quoted: a timestamp's "." and ":" are PostgREST filter syntax.
    .or(`stripe_event_at.is.null,stripe_event_at.lte."${eventAt}"`);
  if (status !== "cancelled") {
    // A cancelled gift never comes back. A gift whose card was never
    // confirmed stays incomplete: a trialing subscription with no card isn't
    // an active gift (Council Review 38). confirmRecurringGift or the first
    // paid installment activates it.
    query = query.neq("status", "cancelled").neq("status", "incomplete");
  }
  const { error } = await query;
  if (error) throw new Error(error.message);
}
