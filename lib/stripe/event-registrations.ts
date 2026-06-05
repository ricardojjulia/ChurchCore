// queryTenantLocalDb and shouldUseLocalTenantFallback removed — Supabase-only architecture (2026-07-10)
import { hasStripeConfig, stripeRequest } from "./client";

export type CreateEventRegistrationPaymentIntentInput = {
  amountCents: number;
  currency?: string | null;
  churchId: string;
  eventId: string;
  registrationId: string;
  registrantEmail?: string | null;
  registrantName?: string | null;
};

export type CreateEventRegistrationPaymentIntentResult = {
  clientSecret: string;
  paymentIntentId: string;
  isStub: boolean;
};

export async function createEventRegistrationPaymentIntent(
  input: CreateEventRegistrationPaymentIntentInput,
): Promise<CreateEventRegistrationPaymentIntentResult> {
  if (!hasStripeConfig()) {
    return {
      clientSecret: `pi_event_registration_stub_${input.registrationId}_secret_test`,
      paymentIntentId: `pi_event_registration_stub_${input.registrationId}`,
      isStub: true,
    };
  }

  const body: Record<string, unknown> = {
    amount: input.amountCents,
    currency: input.currency ?? "usd",
    automatic_payment_methods: "enabled",
    "metadata[church_id]": input.churchId,
    "metadata[event_id]": input.eventId,
    "metadata[event_registration_id]": input.registrationId,
    "metadata[registration_id]": input.registrationId,
    "metadata[purpose]": "event_registration",
  };

  if (input.registrantEmail) body.receipt_email = input.registrantEmail;
  if (input.registrantName) body.description = `Event registration for ${input.registrantName}`;

  const paymentIntent = await stripeRequest<{ id: string; client_secret: string }>(
    "POST",
    "/payment_intents",
    body,
  );

  return {
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
    isStub: false,
  };
}

export type CreateRefundInput = {
  paymentIntentId: string;
  amountCents: number;
  reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer' | null;
};

export type CreateRefundResult = {
  refundId: string;
  status: string;
  amountCents: number;
  isStub: boolean;
};

// ── GL reversal ───────────────────────────────────────────────
//
// Mirrors the pattern used by autoPostToGl in the Stripe webhook route.
// GL posting for event registrations is currently best-effort and
// opt-in (the admin must configure giving_fund_accounts for the fund).
// If no prior GL journal was posted for this registration, this
// function returns early without error.
//
// Dead code — Supabase-only architecture (2026-07-10).
// GL reversal for event registration refunds is handled by
// reverseGlEntryForRefundSupabase in app/api/webhooks/stripe/route.ts,
// which voids the original journal via the Supabase admin client.
// The schema-authoritative columns for finance_journal_lines are:
//   journal_id, church_id, account_id, side ('debit'|'credit'), amount_cents, memo, sort_order
// NOT debit_cents/credit_cents/description (those were a diverged local-only assumption).

export type ReverseGlEntryForRefundInput = {
  churchId: string;
  registrationId: string;
  amountCents: number;
  refundId: string;
  refundedAt: string;
  profileId: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function reverseGlEntryForRefund(_input: ReverseGlEntryForRefundInput): Promise<void> {
  return;
}

export async function createRefund(
  input: CreateRefundInput,
): Promise<CreateRefundResult> {
  if (!hasStripeConfig()) {
    return {
      refundId: `re_stub_${input.paymentIntentId}`,
      status: 'succeeded',
      amountCents: input.amountCents,
      isStub: true,
    };
  }
  const body: Record<string, unknown> = {
    payment_intent: input.paymentIntentId,
    amount: input.amountCents,
  };
  if (input.reason) body.reason = input.reason;
  const refund = await stripeRequest<{ id: string; status: string; amount: number }>(
    'POST',
    '/refunds',
    body,
  );
  return {
    refundId: refund.id,
    status: refund.status,
    amountCents: refund.amount,
    isStub: false,
  };
}
