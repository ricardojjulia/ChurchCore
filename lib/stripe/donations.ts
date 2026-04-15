/**
 * Voluntary donations — Stripe integration helpers.
 *
 * All giving is 100% voluntary. ChurchForge takes no platform cut.
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
  if (!hasStripeConfig()) return "cus_stub";

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
