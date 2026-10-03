import "server-only";

import { startOfDayInTimeZone } from "@/lib/church-time";
import { createTenantAdminClient } from "@/lib/supabase/tenant";

import { stripeRequest } from "./client";

// Recurring gifts (G3.1): a Stripe subscription on the church's own
// connected account (ADR 0025). Every call here carries the account. The
// amount is a price created inline per subscription (price_data), under one
// "Recurring gift" product per account.

export type RecurringFrequency = "weekly" | "biweekly" | "monthly";

export const RECURRING_FREQUENCIES: RecurringFrequency[] = ["weekly", "biweekly", "monthly"];

export function isRecurringFrequency(value: unknown): value is RecurringFrequency {
  return typeof value === "string" && (RECURRING_FREQUENCIES as string[]).includes(value);
}

/** Stripe's interval and interval count for a frequency. */
export function stripeInterval(frequency: RecurringFrequency): { interval: "week" | "month"; count: number } {
  if (frequency === "monthly") return { interval: "month", count: 1 };
  return { interval: "week", count: frequency === "biweekly" ? 2 : 1 };
}

type StripeSubscription = {
  id: string;
  status: string;
  customer?: string;
  default_payment_method?: string | { id: string } | null;
  current_period_end?: number | null;
  trial_end?: number | null;
  pause_collection?: { behavior?: string } | null;
  latest_invoice?: { payment_intent?: { client_secret?: string | null; status?: string } | null } | string | null;
  pending_setup_intent?: { client_secret?: string | null; status?: string } | string | null;
  items?: { data?: Array<{ id: string; price?: { id: string } }> };
};

/**
 * The church's "Recurring gift" product on its Stripe account, created once
 * and remembered on its church_payment_accounts row (a subscription's price
 * must name a product). `churchId` must come from the session or a row.
 */
export async function ensureRecurringProduct(churchId: string, stripeAccount: string): Promise<string> {
  const supabase = createTenantAdminClient();
  const { data, error } = await supabase
    .from("church_payment_accounts")
    .select("stripe_account_id, stripe_recurring_product_id")
    .eq("church_id", churchId)
    .is("disconnected_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = data as { stripe_account_id: string; stripe_recurring_product_id: string | null } | null;
  if (!row || row.stripe_account_id !== stripeAccount) {
    throw new Error("This church's connected Stripe account changed; please try again.");
  }
  if (row.stripe_recurring_product_id) return row.stripe_recurring_product_id;

  const product = await stripeRequest<{ id: string }>(
    "POST",
    "/products",
    { name: "Recurring gift", "metadata[church_id]": churchId },
    { stripeAccount },
  );
  const { error: saveError } = await supabase
    .from("church_payment_accounts")
    .update({ stripe_recurring_product_id: product.id, updated_at: new Date().toISOString() })
    .eq("church_id", churchId)
    .eq("stripe_account_id", stripeAccount);
  if (saveError) throw new Error(saveError.message);
  return product.id;
}

function priceData(
  prefix: string,
  input: { productId: string; amountCents: number; currency: string; frequency: RecurringFrequency },
): Record<string, unknown> {
  const { interval, count } = stripeInterval(input.frequency);
  return {
    [`${prefix}[price_data][currency]`]: input.currency,
    [`${prefix}[price_data][product]`]: input.productId,
    [`${prefix}[price_data][unit_amount]`]: input.amountCents,
    [`${prefix}[price_data][recurring][interval]`]: interval,
    [`${prefix}[price_data][recurring][interval_count]`]: count,
  };
}

function nextPaymentAt(subscription: StripeSubscription): string | null {
  const unix = subscription.status === "trialing" ? subscription.trial_end : subscription.current_period_end;
  return unix ? new Date(unix * 1000).toISOString() : null;
}

export type CreatedSubscription = {
  subscriptionId: string;
  status: string;
  /** What the card step confirms: the first payment (starting today) or a saved card (a future start). */
  intentType: "payment" | "setup";
  /**
   * The card step's secret, or null when Stripe asked for none (the
   * customer already has a usable default card). The subscription exists
   * either way, so the caller always gets its id to link or cancel.
   */
  clientSecret: string | null;
  nextPaymentAt: string | null;
};

/**
 * Creates the subscription, incomplete until the card is confirmed in the
 * browser. Starting today, the first installment is charged then (the card
 * step confirms its PaymentIntent). A future start date is a trial ending at
 * the church's midnight that day: the card is saved now (a SetupIntent) and
 * first charged on the start date.
 */
export async function createRecurringSubscription(input: {
  churchId: string;
  stripeAccount: string;
  customerId: string;
  recurringGiftId: string;
  amountCents: number;
  currency: string;
  frequency: RecurringFrequency;
  /** YYYY-MM-DD in the church's time zone; today or later. */
  startDate: string;
  startsToday: boolean;
  timeZone: string | null;
}): Promise<CreatedSubscription> {
  const productId = await ensureRecurringProduct(input.churchId, input.stripeAccount);
  const body: Record<string, unknown> = {
    customer: input.customerId,
    ...priceData("items[0]", { ...input, productId }),
    payment_behavior: "default_incomplete",
    "payment_settings[save_default_payment_method]": "on_subscription",
    "payment_settings[payment_method_types][]": "card",
    "metadata[church_id]": input.churchId,
    "metadata[recurring_gift_id]": input.recurringGiftId,
  };
  if (input.startsToday) {
    body["expand[]"] = "latest_invoice.payment_intent";
  } else {
    const start = startOfDayInTimeZone(input.startDate, input.timeZone);
    if (!start) throw new Error("Invalid start date.");
    body.trial_end = Math.floor(start.getTime() / 1000);
    body["expand[]"] = "pending_setup_intent";
  }

  const subscription = await stripeRequest<StripeSubscription>("POST", "/subscriptions", body, {
    stripeAccount: input.stripeAccount,
  });

  const clientSecret = input.startsToday
    ? typeof subscription.latest_invoice === "object"
      ? subscription.latest_invoice?.payment_intent?.client_secret
      : null
    : typeof subscription.pending_setup_intent === "object"
      ? subscription.pending_setup_intent?.client_secret
      : null;
  return {
    subscriptionId: subscription.id,
    status: subscription.status,
    intentType: input.startsToday ? "payment" : "setup",
    clientSecret: clientSecret ?? null,
    nextPaymentAt: nextPaymentAt(subscription),
  };
}

export type SubscriptionState = {
  status: string;
  paused: boolean;
  nextPaymentAt: string | null;
  /**
   * A card Stripe can charge: the subscription's default payment method, or
   * a pending setup the member completed. A trialing (future-dated)
   * subscription exists before any card does, so "trialing" alone doesn't
   * mean a gift is set up (PR #177 review).
   */
  cardSaved: boolean;
};

export async function retrieveSubscriptionState(subscriptionId: string, stripeAccount: string): Promise<SubscriptionState> {
  const subscription = await stripeRequest<StripeSubscription>(
    "GET",
    `/subscriptions/${encodeURIComponent(subscriptionId)}?expand[]=pending_setup_intent`,
    undefined,
    { stripeAccount },
  );
  const setup = typeof subscription.pending_setup_intent === "object" ? subscription.pending_setup_intent : null;
  return {
    status: subscription.status,
    paused: Boolean(subscription.pause_collection?.behavior),
    nextPaymentAt: nextPaymentAt(subscription),
    cardSaved: Boolean(subscription.default_payment_method) || setup?.status === "succeeded",
  };
}

/**
 * Changes the amount from the next installment on: same interval, no
 * proration, so nothing is charged now. A frequency change goes through
 * replaceSubscriptionForFrequency instead, since Stripe bills immediately
 * when a subscription's interval changes.
 */
export async function updateSubscriptionAmount(input: {
  subscriptionId: string;
  stripeAccount: string;
  churchId: string;
  amountCents: number;
  currency: string;
  /** The gift's current frequency: unchanged here. */
  frequency: RecurringFrequency;
}): Promise<void> {
  const productId = await ensureRecurringProduct(input.churchId, input.stripeAccount);
  const subscription = await stripeRequest<StripeSubscription>(
    "GET",
    `/subscriptions/${encodeURIComponent(input.subscriptionId)}`,
    undefined,
    { stripeAccount: input.stripeAccount },
  );
  const itemId = subscription.items?.data?.[0]?.id;
  if (!itemId) throw new Error("The subscription has no item to change.");
  await stripeRequest(
    "POST",
    `/subscriptions/${encodeURIComponent(input.subscriptionId)}`,
    {
      "items[0][id]": itemId,
      ...priceData("items[0]", { ...input, productId }),
      proration_behavior: "none",
    },
    { stripeAccount: input.stripeAccount },
  );
}

/** Pauses (no installments are charged) or resumes the subscription. */
export async function setSubscriptionPaused(subscriptionId: string, stripeAccount: string, paused: boolean): Promise<void> {
  await stripeRequest(
    "POST",
    `/subscriptions/${encodeURIComponent(subscriptionId)}`,
    // An empty value unsets pause_collection, resuming collection.
    paused ? { "pause_collection[behavior]": "void" } : { pause_collection: "" },
    { stripeAccount },
  );
}

/** Stripe's subscription status as the recurring gift's. */
export function recurringStatusFromStripe(status: string, paused: boolean): "incomplete" | "active" | "paused" | "past_due" | "cancelled" {
  if (status === "canceled" || status === "incomplete_expired") return "cancelled";
  if (status === "incomplete") return "incomplete";
  // A pause wins over past due: Stripe can keep status past_due with
  // collection paused, and the member's pause must hold (PR #177 review).
  if (paused) return "paused";
  if (status === "past_due" || status === "unpaid") return "past_due";
  return "active";
}

/**
 * Changes how often a gift is given, from its next scheduled date (PR #177
 * review): Stripe bills at once when a subscription's interval changes, so
 * instead a new subscription with the new amount and frequency starts as a
 * trial ending on the old one's next billing date, on the same saved card,
 * and the old one ends at its period's end without billing again. Returns
 * the new subscription's id.
 */
export async function replaceSubscriptionForFrequency(input: {
  subscriptionId: string;
  stripeAccount: string;
  churchId: string;
  recurringGiftId: string;
  amountCents: number;
  currency: string;
  frequency: RecurringFrequency;
  paused: boolean;
}): Promise<{ subscriptionId: string; nextPaymentAt: string | null }> {
  const current = await stripeRequest<StripeSubscription>(
    "GET",
    `/subscriptions/${encodeURIComponent(input.subscriptionId)}`,
    undefined,
    { stripeAccount: input.stripeAccount },
  );
  const card = typeof current.default_payment_method === "object" ? current.default_payment_method?.id : current.default_payment_method;
  const periodEnd = current.status === "trialing" ? current.trial_end : current.current_period_end;
  if (!card || !current.customer || !periodEnd) throw new Error("The gift has no saved card or billing date to carry over.");

  const productId = await ensureRecurringProduct(input.churchId, input.stripeAccount);
  const replacement = await stripeRequest<StripeSubscription>(
    "POST",
    "/subscriptions",
    {
      customer: current.customer,
      ...priceData("items[0]", { ...input, productId }),
      default_payment_method: card,
      // No charge until the date the old subscription would have billed.
      trial_end: periodEnd,
      ...(input.paused ? { "pause_collection[behavior]": "void" } : {}),
      "metadata[church_id]": input.churchId,
      "metadata[recurring_gift_id]": input.recurringGiftId,
    },
    { stripeAccount: input.stripeAccount },
  );
  await stripeRequest(
    "POST",
    `/subscriptions/${encodeURIComponent(input.subscriptionId)}`,
    { cancel_at_period_end: "true" },
    { stripeAccount: input.stripeAccount },
  );
  return { subscriptionId: replacement.id, nextPaymentAt: new Date(periodEnd * 1000).toISOString() };
}
