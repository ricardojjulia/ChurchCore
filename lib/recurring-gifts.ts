import "server-only";

import { todayInTimeZone } from "@/lib/church-time";
import { cancelStripeSubscription, createOrGetStripeCustomer, onlineGivingNotice, onlineGivingStatus, stripePublishableKey } from "@/lib/stripe/donations";
import {
  createRecurringSubscription,
  isRecurringFrequency,
  recurringStatusFromStripe,
  retrieveSubscriptionState,
  setSubscriptionPaused,
  updateSubscriptionPlan,
  type RecurringFrequency,
} from "@/lib/stripe/recurring";
import type { createTenantAdminClient } from "@/lib/supabase/tenant";

// Recurring gifts (G3.1): a member's standing gift on the church's own
// Stripe account (ADR 0025). The member and admin actions share this core;
// both pass a church id and (for members) a profile id from the session,
// never from the caller.

type AdminClient = ReturnType<typeof createTenantAdminClient>;

export const MAX_RECURRING_CENTS = 10_000_000;
/** How far ahead a recurring gift may start. */
export const MAX_START_DAYS = 366;

export type RecurringGift = {
  id: string;
  amountCents: number;
  currency: string;
  fundDesignation: string | null;
  frequency: RecurringFrequency;
  startDate: string;
  status: "incomplete" | "active" | "paused" | "past_due" | "cancelled";
  isAnonymous: boolean;
  nextPaymentAt: string | null;
  lastPaymentAt: string | null;
  /** Only for admins: the giver, or null for an anonymous gift. */
  donorName?: string | null;
};

const GIFT_COLUMNS =
  "id, church_id, profile_id, amount_cents, currency, fund_designation, frequency, start_date, status, is_anonymous, stripe_subscription_id, stripe_account_id, next_payment_at, last_payment_at";

type GiftRow = {
  id: string;
  church_id: string;
  profile_id: string | null;
  amount_cents: number;
  currency: string;
  fund_designation: string | null;
  frequency: RecurringFrequency;
  start_date: string;
  status: RecurringGift["status"];
  is_anonymous: boolean;
  stripe_subscription_id: string | null;
  stripe_account_id: string | null;
  next_payment_at: string | null;
  last_payment_at: string | null;
};

export function toRecurringGift(row: GiftRow): RecurringGift {
  return {
    id: row.id,
    amountCents: row.amount_cents,
    currency: row.currency,
    fundDesignation: row.fund_designation,
    frequency: row.frequency,
    startDate: row.start_date,
    status: row.status,
    isAnonymous: row.is_anonymous,
    nextPaymentAt: row.next_payment_at,
    lastPaymentAt: row.last_payment_at,
  };
}

/** A stubbed (keyless or demo) gift never reached Stripe. */
function isStub(row: Pick<GiftRow, "stripe_subscription_id">) {
  return !row.stripe_subscription_id || row.stripe_subscription_id.startsWith("sub_stub_");
}

export type StartRecurringGiftInput = {
  amountCents: number;
  fundDesignation?: string | null;
  frequency: unknown;
  /** YYYY-MM-DD, in the church's time zone; today if absent. */
  startDate?: string | null;
  isAnonymous?: boolean;
};

export type StartRecurringGiftResult =
  | {
      ok: true;
      recurringGiftId: string;
      /** Stripe's card step; null when payments are stubbed. */
      checkout: {
        clientSecret: string;
        intentType: "payment" | "setup";
        publishableKey: string;
        stripeAccount: string;
      } | null;
    }
  | { ok: false; error: string };

/**
 * Starts a member's recurring gift: writes it incomplete, creates the
 * subscription on the church's account, and returns the card step. Nothing
 * is active until the card is confirmed (confirmRecurringGift).
 */
export async function startRecurringGift(
  admin: AdminClient,
  ctx: { churchId: string; profileId: string; timeZone: string | null },
  input: StartRecurringGiftInput,
): Promise<StartRecurringGiftResult> {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0 || input.amountCents > MAX_RECURRING_CENTS) {
    return { ok: false, error: "Enter a gift amount between $0.01 and $100,000." };
  }
  if (!isRecurringFrequency(input.frequency)) return { ok: false, error: "Choose weekly, every two weeks, or monthly." };
  const frequency = input.frequency;

  const today = todayInTimeZone(ctx.timeZone);
  const startDate = input.startDate?.trim() || today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || startDate < today) {
    return { ok: false, error: "Choose a start date from today on." };
  }
  const latest = new Date(Date.parse(`${today}T00:00:00Z`) + MAX_START_DAYS * 86_400_000).toISOString().slice(0, 10);
  if (startDate > latest) return { ok: false, error: "Choose a start date within the next year." };

  const giving = await onlineGivingStatus(ctx.churchId);
  const givingOff = onlineGivingNotice(giving.mode);
  if (givingOff) return { ok: false, error: givingOff };

  const { data: profile } = await admin
    .from("profiles")
    .select("full_name, email")
    .eq("id", ctx.profileId)
    .eq("church_id", ctx.churchId)
    .maybeSingle();
  const donor = profile as { full_name: string | null; email: string | null } | null;
  if (!donor?.email) {
    return { ok: false, error: "Add an email address to your profile first, so your receipts can reach you." };
  }

  const { data: inserted, error: insertError } = await admin
    .from("recurring_gifts")
    .insert({
      church_id: ctx.churchId,
      profile_id: ctx.profileId,
      amount_cents: input.amountCents,
      currency: "usd",
      fund_designation: input.fundDesignation?.trim() || "General",
      frequency,
      start_date: startDate,
      status: "incomplete",
      is_anonymous: input.isAnonymous ?? false,
      stripe_account_id: giving.stripeAccount,
    })
    .select("id")
    .single();
  if (insertError || !inserted) {
    console.error("[recurring-gifts] Insert failed:", insertError?.message);
    return { ok: false, error: "Couldn't start your recurring gift. Please try again." };
  }
  const recurringGiftId = (inserted as { id: string }).id;

  if (giving.mode === "stub") {
    // Keyless (development) or demo: no Stripe, so the gift is simply active.
    await admin
      .from("recurring_gifts")
      .update({
        status: "active",
        stripe_subscription_id: `sub_stub_${recurringGiftId}`,
        next_payment_at: `${startDate}T12:00:00Z`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", recurringGiftId)
      .eq("church_id", ctx.churchId);
    return { ok: true, recurringGiftId, checkout: null };
  }

  const stripeAccount = giving.stripeAccount as string;
  const publishableKey = stripePublishableKey();
  let createdSubscriptionId: string | null = null;
  try {
    if (!publishableKey) throw new Error("No publishable key.");
    const customerId = await createOrGetStripeCustomer({
      email: donor.email,
      name: donor.full_name ?? undefined,
      churchId: ctx.churchId,
      stripeAccount,
    });
    const subscription = await createRecurringSubscription({
      churchId: ctx.churchId,
      stripeAccount,
      customerId,
      recurringGiftId,
      amountCents: input.amountCents,
      currency: "usd",
      frequency,
      startDate,
      startsToday: startDate === today,
      timeZone: ctx.timeZone,
    });
    createdSubscriptionId = subscription.subscriptionId;
    const { error: linkError } = await admin
      .from("recurring_gifts")
      .update({
        stripe_subscription_id: subscription.subscriptionId,
        stripe_customer_id: customerId,
        next_payment_at: subscription.nextPaymentAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", recurringGiftId)
      .eq("church_id", ctx.churchId);
    if (linkError) throw new Error(linkError.message);
    return {
      ok: true,
      recurringGiftId,
      checkout: { clientSecret: subscription.clientSecret, intentType: subscription.intentType, publishableKey, stripeAccount },
    };
  } catch (error) {
    console.error("[recurring-gifts] Starting the subscription failed:", error instanceof Error ? error.message : error);
    // A subscription created before the failure is cancelled at Stripe too,
    // so nothing is left open there with no gift here (Council Review 38).
    if (createdSubscriptionId) {
      await cancelStripeSubscription(createdSubscriptionId, ctx.churchId, stripeAccount).catch((cancelError) =>
        console.error("[recurring-gifts] Couldn't cancel the orphaned subscription:", cancelError instanceof Error ? cancelError.message : cancelError),
      );
    }
    await admin
      .from("recurring_gifts")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", recurringGiftId)
      .eq("church_id", ctx.churchId);
    return { ok: false, error: "Couldn't start your recurring gift. Please try again." };
  }
}

/** Loads a gift in this church, and (when given) owned by this profile. */
async function loadGift(admin: AdminClient, churchId: string, id: string, profileId: string | null): Promise<GiftRow | null> {
  let query = admin.from("recurring_gifts").select(GIFT_COLUMNS).eq("id", id).eq("church_id", churchId);
  if (profileId) query = query.eq("profile_id", profileId);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  return (data as GiftRow | null) ?? null;
}

type ActionResult = { ok: true; gift: RecurringGift } | { ok: false; error: string };

const NOT_YOURS = "That recurring gift isn't yours to change.";

/**
 * After the card step: reads the subscription's real state from Stripe (the
 * browser's word is not enough) and records it. The webhook keeps it in
 * sync afterwards.
 */
export async function confirmRecurringGift(admin: AdminClient, churchId: string, profileId: string, id: string): Promise<ActionResult> {
  const row = await loadGift(admin, churchId, id, profileId);
  if (!row) return { ok: false, error: NOT_YOURS };
  if (isStub(row)) return { ok: true, gift: toRecurringGift(row) };
  const state = await retrieveSubscriptionState(row.stripe_subscription_id as string, row.stripe_account_id as string);
  const status = recurringStatusFromStripe(state.status, state.paused);
  const { data, error } = await admin
    .from("recurring_gifts")
    .update({ status, next_payment_at: state.nextPaymentAt, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("church_id", churchId)
    .neq("status", "cancelled")
    .select(GIFT_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return { ok: true, gift: toRecurringGift((data as GiftRow | null) ?? { ...row, status }) };
}

/** Changes the amount, fund or frequency from the next installment on. */
export async function updateRecurringGift(
  admin: AdminClient,
  churchId: string,
  profileId: string,
  id: string,
  change: { amountCents?: number; fundDesignation?: string | null; frequency?: unknown },
): Promise<ActionResult> {
  const row = await loadGift(admin, churchId, id, profileId);
  if (!row) return { ok: false, error: NOT_YOURS };
  if (row.status === "cancelled" || row.status === "incomplete") {
    return { ok: false, error: "Only an active or paused recurring gift can be changed." };
  }
  const amountCents = change.amountCents ?? row.amount_cents;
  if (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents > MAX_RECURRING_CENTS) {
    return { ok: false, error: "Enter a gift amount between $0.01 and $100,000." };
  }
  const frequency = change.frequency ?? row.frequency;
  if (!isRecurringFrequency(frequency)) return { ok: false, error: "Choose weekly, every two weeks, or monthly." };
  const fundDesignation = change.fundDesignation === undefined ? row.fund_designation : change.fundDesignation?.trim() || "General";

  if ((amountCents !== row.amount_cents || frequency !== row.frequency) && !isStub(row)) {
    await updateSubscriptionPlan({
      subscriptionId: row.stripe_subscription_id as string,
      stripeAccount: row.stripe_account_id as string,
      churchId,
      amountCents,
      currency: row.currency,
      frequency,
    });
  }
  const { data, error } = await admin
    .from("recurring_gifts")
    .update({ amount_cents: amountCents, frequency, fund_designation: fundDesignation, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("church_id", churchId)
    .select(GIFT_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return { ok: true, gift: toRecurringGift(data as GiftRow) };
}

/** Pauses or resumes a gift (the member's own, or any in the church for an admin: profileId null). */
export async function setRecurringGiftPaused(
  admin: AdminClient,
  churchId: string,
  profileId: string | null,
  id: string,
  paused: boolean,
): Promise<ActionResult> {
  const row = await loadGift(admin, churchId, id, profileId);
  if (!row) return { ok: false, error: NOT_YOURS };
  if (paused ? row.status !== "active" && row.status !== "past_due" : row.status !== "paused") {
    return { ok: false, error: paused ? "Only an active recurring gift can be paused." : "Only a paused recurring gift can be resumed." };
  }
  if (!isStub(row)) await setSubscriptionPaused(row.stripe_subscription_id as string, row.stripe_account_id as string, paused);
  const { data, error } = await admin
    .from("recurring_gifts")
    .update({ status: paused ? "paused" : "active", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("church_id", churchId)
    .select(GIFT_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return { ok: true, gift: toRecurringGift(data as GiftRow) };
}

/** Cancels a gift at Stripe, then here (the member's own, or any in the church for an admin). */
export async function cancelRecurringGift(admin: AdminClient, churchId: string, profileId: string | null, id: string): Promise<ActionResult> {
  const row = await loadGift(admin, churchId, id, profileId);
  if (!row) return { ok: false, error: NOT_YOURS };
  if (row.status === "cancelled") return { ok: true, gift: toRecurringGift(row) };
  if (!isStub(row)) {
    await cancelStripeSubscription(row.stripe_subscription_id as string, churchId, row.stripe_account_id);
  }
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("recurring_gifts")
    .update({ status: "cancelled", cancelled_at: now, next_payment_at: null, updated_at: now })
    .eq("id", id)
    .eq("church_id", churchId)
    .select(GIFT_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return { ok: true, gift: toRecurringGift(data as GiftRow) };
}

/** A member's own recurring gifts, newest first. */
export async function listOwnRecurringGifts(admin: AdminClient, churchId: string, profileId: string): Promise<RecurringGift[]> {
  const { data, error } = await admin
    .from("recurring_gifts")
    .select(GIFT_COLUMNS)
    .eq("church_id", churchId)
    .eq("profile_id", profileId)
    .neq("status", "incomplete")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as GiftRow[]).map(toRecurringGift);
}

/** The church's recurring gifts for admins; an anonymous gift's giver is never shown. */
export async function listChurchRecurringGifts(admin: AdminClient, churchId: string): Promise<RecurringGift[]> {
  const { data, error } = await admin
    .from("recurring_gifts")
    .select(`${GIFT_COLUMNS}, profiles(full_name)`)
    .eq("church_id", churchId)
    .neq("status", "incomplete")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Array<GiftRow & { profiles: { full_name: string | null } | null }>).map((row) => ({
    ...toRecurringGift(row),
    donorName: row.is_anonymous ? null : (row.profiles?.full_name ?? null),
  }));
}
