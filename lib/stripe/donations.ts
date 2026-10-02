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

import { stubsAllowed } from "@/lib/stub-mode";

import { stripeRequest, hasStripeConfig } from "./client";
import { getChurchStripeAccount, stripeConnectClientId } from "./connect";

/**
 * Whether a member can give online right now (Council Review 22, G3.0,
 * G3.0b).
 *
 * - `"stub"`: no Stripe keys, outside production or in demo mode. Gifts are
 *   recorded as succeeded without charging anyone — for local development
 *   and the demo only.
 * - `"unconfigured"`: no Stripe keys in production. Online giving is off;
 *   nothing may be recorded as paid.
 * - `"unavailable"`: the platform's Stripe setup is incomplete (the secret
 *   key is set, but the publishable key or the Connect client id isn't). No
 *   row or PaymentIntent is made.
 * - `"not_connected"`: the platform is ready but this church hasn't connected
 *   its Stripe account, or Stripe isn't letting it take charges yet. Gifts go
 *   only to the church's own account (ADR 0025), so giving is off.
 * - `"live"`: the church's account is connected and can take charges; the
 *   member pays with the card form, charged directly on that account.
 */
export type OnlineGivingMode = "stub" | "unconfigured" | "unavailable" | "not_connected" | "live";

/** The key the browser's card form loads Stripe with, or null when unset. */
export function stripePublishableKey(): string | null {
  return process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() || null;
}

/** Stubbed payments are allowed only outside production, or in demo mode. */
export function stubPaymentsAllowed(): boolean {
  return stubsAllowed();
}

/** The platform-wide mode, before looking at any church's account. */
export function platformGivingMode(): "stub" | "unconfigured" | "unavailable" | "ready" {
  if (hasStripeConfig()) return stripePublishableKey() && stripeConnectClientId() ? "ready" : "unavailable";
  return stubPaymentsAllowed() ? "stub" : "unconfigured";
}

export type OnlineGivingStatus = {
  mode: OnlineGivingMode;
  /** The church's connected account, in live mode only. */
  stripeAccount: string | null;
};

/**
 * Whether this church can take online gifts, and on which Stripe account.
 * `churchId` must come from the server-side session.
 */
export async function onlineGivingStatus(churchId: string): Promise<OnlineGivingStatus> {
  const platform = platformGivingMode();
  if (platform !== "ready") return { mode: platform, stripeAccount: null };
  const account = await getChurchStripeAccount(churchId);
  return account?.chargesEnabled
    ? { mode: "live", stripeAccount: account.accountId }
    : { mode: "not_connected", stripeAccount: null };
}

/**
 * Why a member can't give online right now, or null when they can. Shown up
 * front on the giving page and returned by `initiateDonationAction`.
 */
export function onlineGivingNotice(mode: OnlineGivingMode): string | null {
  if (mode === "unconfigured" || mode === "not_connected") {
    return "Online giving isn't set up for this church yet. Please give in person or contact the church office.";
  }
  if (mode === "unavailable") {
    return "Online card giving isn't fully set up yet. Please give in person or contact the church office.";
  }
  return null;
}

/**
 * The connected account a live Stripe call must act on (ADR 0025): refusing
 * rather than falling back to the platform account, where the church's money
 * must never land.
 */
function churchAccount(stripeAccount: string | null | undefined): { stripeAccount: string } {
  if (!stripeAccount) throw new Error("This church has no connected Stripe account (ADR 0025).");
  return { stripeAccount };
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
  /** The church's connected account the gift is charged on (ADR 0025). */
  stripeAccount?: string | null;
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
    // Cards only (Apple Pay and Google Pay are cards): every one completes on
    // the page, so no redirect return is needed. The old
    // `automatic_payment_methods: "enabled"` form-encoded as a bare string
    // Stripe rejects (it wants automatic_payment_methods[enabled]=true), so
    // live PaymentIntents never got created (Council Review 34).
    "payment_method_types[]": "card",
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
    churchAccount(input.stripeAccount),
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
  /** Customers live on the church's connected account (ADR 0025). */
  stripeAccount?: string | null;
}

export async function createOrGetStripeCustomer(
  input: CreateOrGetStripeCustomerInput,
): Promise<string> {
  if (!hasStripeConfig()) {
    if (!stubPaymentsAllowed()) throw new Error("Stripe is not configured.");
    return "cus_stub";
  }

  // Search by email first to avoid duplicates
  const onAccount = churchAccount(input.stripeAccount);
  const search = await stripeRequest<{
    data: Array<{ id: string }>;
  }>("GET", `/customers/search?query=email:'${encodeURIComponent(input.email)}'&limit=1`, undefined, onAccount);

  if (search.data.length > 0) return search.data[0].id;

  const customer = await stripeRequest<{ id: string }>(
    "POST",
    "/customers",
    {
      email: input.email,
      name: input.name,
      "metadata[church_id]": input.churchId,
    },
    onAccount,
  );

  return customer.id;
}

export interface CancelSubscriptionResult {
  cancelled: boolean;
  isStub: boolean;
}

export async function cancelStripeSubscription(
  subscriptionId: string,
  stripeAccount?: string | null,
): Promise<CancelSubscriptionResult> {
  if (!hasStripeConfig()) return { cancelled: true, isStub: true };

  await stripeRequest(
    "POST",
    `/subscriptions/${subscriptionId}/cancel`,
    { cancellation_details: "customer_requested" },
    churchAccount(stripeAccount),
  );

  return { cancelled: true, isStub: false };
}

/**
 * A PaymentIntent's status as Stripe reports it, so a donation is only marked
 * succeeded when Stripe says so, never on the browser's word (S8). Without
 * STRIPE_SECRET_KEY every payment counts as succeeded only where stubs are
 * allowed (never in production outside demo mode).
 */
export async function retrievePaymentIntentStatus(
  paymentIntentId: string,
  stripeAccount?: string | null,
): Promise<string> {
  if (!hasStripeConfig()) return stubPaymentsAllowed() ? "succeeded" : "unconfigured";
  const pi = await stripeRequest<{ status: string }>(
    "GET",
    `/payment_intents/${encodeURIComponent(paymentIntentId)}`,
    undefined,
    churchAccount(stripeAccount),
  );
  return pi.status;
}

/**
 * Cancels a PaymentIntent a member abandoned before paying (G3.0), so it isn't
 * left open at Stripe. Returns the PaymentIntent's status afterwards: if it
 * already succeeded or is processing, Stripe refuses to cancel and the gift
 * must not be marked cancelled.
 */
export async function cancelPaymentIntent(paymentIntentId: string, stripeAccount?: string | null): Promise<string> {
  if (!hasStripeConfig()) return "canceled";
  const onAccount = churchAccount(stripeAccount);
  try {
    const pi = await stripeRequest<{ status: string }>(
      "POST",
      `/payment_intents/${encodeURIComponent(paymentIntentId)}/cancel`,
      { cancellation_reason: "abandoned" },
      onAccount,
    );
    return pi.status;
  } catch {
    // Not cancellable (already succeeded, processing, or canceled): report
    // its real status instead.
    return retrievePaymentIntentStatus(paymentIntentId, onAccount.stripeAccount);
  }
}
