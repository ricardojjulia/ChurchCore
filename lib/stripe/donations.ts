/**
 * Voluntary donations — Stripe integration helpers.
 *
 * All giving is 100% voluntary. ChurchCore takes no platform cut.
 * Every donation goes directly to the church's connected Stripe account.
 *
 * Design:
 *  - One-time: creates a PaymentIntent, returns client_secret for
 *    Stripe Elements on the frontend.
 *  - Recurring: creates a Subscription via a SetupIntent flow.
 *  - All amounts in cents; currency default USD.
 *  - Receipt emails sent by the church's Stripe account or by
 *    our sendEmail helper (consent-gated).
 */

import { stripeRequest, hasStripeConfig } from "./client";

/**
 * Whether a member can give online right now (Council Review 22).
 *
 * - `"stub"`: no Stripe keys, outside production or in demo mode. Gifts are
 *   recorded as succeeded without charging anyone — for local development
 *   and the demo only.
 * - `"unconfigured"`: no Stripe keys in production. Online giving is off;
 *   nothing may be recorded as paid.
 * - `"unavailable"`: Stripe is configured, but the card form (G3.0, Stripe
 *   Elements) isn't built, so a PaymentIntent could never be paid. No row or
 *   PaymentIntent is created. G3.0 adds a `"live"` mode here.
 */
export type OnlineGivingMode = "stub" | "unconfigured" | "unavailable";

/** Stubbed payments are allowed only outside production, or in demo mode. */
export function stubPaymentsAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_DEMO_MODE === "true";
}

export function onlineGivingMode(): OnlineGivingMode {
  if (hasStripeConfig()) return "unavailable";
  return stubPaymentsAllowed() ? "stub" : "unconfigured";
}

/**
 * Why a member can't give online right now, or null when they can. Shown up
 * front on the giving page and returned by `initiateDonationAction`.
 */
export function onlineGivingNotice(mode: OnlineGivingMode = onlineGivingMode()): string | null {
  if (mode === "unconfigured") {
    return "Online giving isn't set up for this church yet. Please give in person or contact the church office.";
  }
  if (mode === "unavailable") {
    return "Online card giving isn't available yet. Please give in person or contact the church office.";
  }
  return null;
}

export interface CreatePaymentIntentInput {
  amountCents: number;
  currency?: string;
  /** Stripe customer ID — creates one first if absent. */
  stripeCustomerId?: string;
  /** Free-text designation e.g. "Building Fund". Stored as metadata. */
  fundDesignation?: string;
  donorEmail?: string;
  donorName?: string;
  churchId: string;
  /** Our donations row id, so the webhook can find the row (S8). */
  donationId?: string;
}

export interface CreatePaymentIntentResult {
  /** Pass to Stripe Elements `confirmPayment`. */
  clientSecret: string;
  paymentIntentId: string;
  /** True when running without STRIPE_SECRET_KEY (local stub). */
  isStub: boolean;
}

export async function createPaymentIntent(
  input: CreatePaymentIntentInput,
): Promise<CreatePaymentIntentResult> {
  if (!hasStripeConfig()) {
    if (!stubPaymentsAllowed()) throw new Error("Stripe is not configured.");
    return {
      clientSecret: "pi_stub_secret_test",
      paymentIntentId: "pi_stub",
      isStub: true,
    };
  }

  const body: Record<string, unknown> = {
    amount: input.amountCents,
    currency: input.currency ?? "usd",
    automatic_payment_methods: "enabled",
    "metadata[church_id]": input.churchId,
    "metadata[fund_designation]": input.fundDesignation ?? "General",
    "metadata[voluntary]": "true",
  };
  if (input.donationId) body["metadata[donation_id]"] = input.donationId;
  if (input.stripeCustomerId) body.customer = input.stripeCustomerId;
  if (input.donorEmail) body.receipt_email = input.donorEmail;

  const pi = await stripeRequest<{ id: string; client_secret: string }>(
    "POST",
    "/payment_intents",
    body,
  );

  return {
    clientSecret: pi.client_secret,
    paymentIntentId: pi.id,
    isStub: false,
  };
}

export interface CreateOrGetStripeCustomerInput {
  email: string;
  name?: string;
  churchId: string;
}

export async function createOrGetStripeCustomer(
  input: CreateOrGetStripeCustomerInput,
): Promise<string> {
  if (!hasStripeConfig()) {
    if (!stubPaymentsAllowed()) throw new Error("Stripe is not configured.");
    return "cus_stub";
  }

  // Search by email first to avoid duplicates
  const search = await stripeRequest<{
    data: Array<{ id: string }>;
  }>("GET", `/customers/search?query=email:'${encodeURIComponent(input.email)}'&limit=1`);

  if (search.data.length > 0) return search.data[0].id;

  const customer = await stripeRequest<{ id: string }>("POST", "/customers", {
    email: input.email,
    name: input.name,
    "metadata[church_id]": input.churchId,
  });

  return customer.id;
}

export interface CancelSubscriptionResult {
  cancelled: boolean;
  isStub: boolean;
}

export async function cancelStripeSubscription(
  subscriptionId: string,
): Promise<CancelSubscriptionResult> {
  if (!hasStripeConfig()) return { cancelled: true, isStub: true };

  await stripeRequest("POST", `/subscriptions/${subscriptionId}/cancel`, {
    cancellation_details: "customer_requested",
  });

  return { cancelled: true, isStub: false };
}

/**
 * A PaymentIntent's status as Stripe reports it, so a donation is only marked
 * succeeded when Stripe says so, never on the browser's word (S8). Without
 * STRIPE_SECRET_KEY every payment counts as succeeded only where stubs are
 * allowed (never in production outside demo mode).
 */
export async function retrievePaymentIntentStatus(paymentIntentId: string): Promise<string> {
  if (!hasStripeConfig()) return stubPaymentsAllowed() ? "succeeded" : "unconfigured";
  const pi = await stripeRequest<{ status: string }>("GET", `/payment_intents/${encodeURIComponent(paymentIntentId)}`);
  return pi.status;
}

