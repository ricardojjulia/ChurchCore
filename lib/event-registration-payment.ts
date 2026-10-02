import "server-only";

import { cancelPaymentIntent, onlineGivingStatus, stripePublishableKey } from "@/lib/stripe/donations";
import { createEventRegistrationPaymentIntent, stubPaymentIntentId } from "@/lib/stripe/event-registrations";
import type { createTenantAdminClient } from "@/lib/supabase/tenant";

// Paying for an event registration (G3.0c): the registrant pays in Stripe's
// card form, on the church's own connected account (ADR 0025), right after
// registering. The webhook marks the registration paid once Stripe says so.

type AdminClient = ReturnType<typeof createTenantAdminClient>;

/** What the browser needs to show Stripe's card form for a registration. */
export type RegistrationCheckout = {
  clientSecret: string;
  publishableKey: string;
  /** The church's connected account the payment is charged on. */
  stripeAccount: string;
};

export const EVENT_PAYMENT_UNAVAILABLE =
  "This event takes payment online, but online payment isn't set up for this church yet. Please contact the church office to register.";

export const EVENT_PAYMENT_START_FAILED = "Couldn't start the payment for this registration. Please try again.";

/**
 * Whether a paid registration can be taken for this church right now: the
 * church can take payments on its connected account, or payments are stubbed
 * (outside production, or in demo mode). Checked before the registration is
 * written, so nobody is left registered with a payment they can't make.
 */
export async function eventPaymentReadiness(churchId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { mode } = await onlineGivingStatus(churchId);
  return mode === "live" || mode === "stub" ? { ok: true } : { ok: false, error: EVENT_PAYMENT_UNAVAILABLE };
}

/**
 * Creates the registration's PaymentIntent and its payment row. Demo mode
 * records the stub id the demo payment route completes (S4). Throws when
 * Stripe or the payment row fails: the caller removes the registration and
 * tells the registrant, instead of leaving a registration nobody can pay
 * (Council Review 35).
 */
export async function startRegistrationPayment(
  admin: AdminClient,
  input: {
    churchId: string;
    eventId: string;
    registrationId: string;
    amountCents: number;
    currency: string | null | undefined;
    registrantEmail?: string | null;
    registrantName?: string | null;
  },
): Promise<{ paymentIntentId: string; checkout: RegistrationCheckout | null }> {
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const paymentIntent = demoMode
    ? null
    : await createEventRegistrationPaymentIntent({
        amountCents: input.amountCents,
        currency: input.currency,
        churchId: input.churchId,
        eventId: input.eventId,
        registrationId: input.registrationId,
        registrantEmail: input.registrantEmail,
        registrantName: input.registrantName,
      });
  const paymentIntentId = paymentIntent?.paymentIntentId ?? stubPaymentIntentId(input.registrationId);

  const { error } = await admin.from("event_registration_payments").upsert(
    {
      registration_id: input.registrationId,
      event_id: input.eventId,
      church_id: input.churchId,
      provider: "stripe",
      status: "pending",
      amount_cents: input.amountCents,
      currency: input.currency ?? "usd",
      payment_intent_id: paymentIntentId,
      // The church account it's charged on, for refunds (ADR 0025).
      stripe_account_id: paymentIntent?.stripeAccount ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "registration_id" },
  );
  if (error) throw new Error(`Payment row failed: ${error.message}`);

  const publishableKey = stripePublishableKey();
  const checkout =
    paymentIntent && !paymentIntent.isStub && paymentIntent.stripeAccount && publishableKey
      ? { clientSecret: paymentIntent.clientSecret, publishableKey, stripeAccount: paymentIntent.stripeAccount }
      : null;
  return { paymentIntentId, checkout };
}

/**
 * Removes a registration whose payment couldn't be started. Best effort: a
 * failure is logged, and the registration stays unpaid (and visible to
 * admins) rather than being reported as complete.
 */
export async function removeUnstartedRegistration(admin: AdminClient, churchId: string, registrationId: string) {
  const { error } = await admin.from("event_registrations").delete().eq("id", registrationId).eq("church_id", churchId);
  if (error) console.error("[event-payment] Couldn't remove the unpaid registration:", error.message);
}

/**
 * Cancels a registration whose registrant left the card step without paying
 * (G3.0c): cancels the PaymentIntent at Stripe first, then the registration,
 * so its place is freed. Matched by the registration and its PaymentIntent
 * id together, and only while payment is still pending; `churchId` narrows
 * it further (the signed-in member's church). If Stripe says the payment went
 * through after all, nothing is cancelled and the webhook records it.
 */
export async function cancelUnpaidRegistration(
  admin: AdminClient,
  input: { registrationId: string; paymentIntentId: string; churchId?: string },
): Promise<{ ok: boolean; cancelled: boolean; error?: string }> {
  let query = admin
    .from("event_registration_payments")
    .select("registration_id, church_id, stripe_account_id, event_registrations!inner(status, payment_status)")
    .eq("registration_id", input.registrationId)
    .eq("payment_intent_id", input.paymentIntentId)
    .eq("event_registrations.payment_status", "pending")
    .neq("event_registrations.status", "cancelled");
  if (input.churchId) query = query.eq("church_id", input.churchId);
  const { data, error } = await query.maybeSingle();
  if (error) {
    console.error("[event-payment] Unpaid registration lookup failed:", error.message);
    return { ok: false, cancelled: false, error: "Couldn't cancel the registration. Please try again." };
  }
  if (!data) return { ok: true, cancelled: false };
  const row = data as { church_id: string; stripe_account_id: string | null };

  let status: string;
  try {
    status = await cancelPaymentIntent(input.paymentIntentId, row.stripe_account_id);
  } catch (stripeError) {
    console.error(
      "[event-payment] Cancelling the PaymentIntent failed:",
      stripeError instanceof Error ? stripeError.message : stripeError,
    );
    return { ok: false, cancelled: false, error: "Couldn't cancel the payment. Please try again." };
  }
  if (status !== "canceled") return { ok: true, cancelled: false };

  const now = new Date().toISOString();
  const { error: regError } = await admin
    .from("event_registrations")
    // payment_status has no "cancelled"; the payment row records it.
    .update({ status: "cancelled" })
    .eq("id", input.registrationId)
    .eq("church_id", row.church_id)
    .eq("payment_status", "pending");
  if (regError) {
    console.error("[event-payment] Cancelling the registration failed:", regError.message);
    return { ok: false, cancelled: false, error: "The payment was cancelled, but the registration couldn't be. Please contact the church office." };
  }
  await admin
    .from("event_registration_payments")
    .update({ status: "cancelled", updated_at: now })
    .eq("registration_id", input.registrationId)
    .eq("church_id", row.church_id);
  return { ok: true, cancelled: true };
}
