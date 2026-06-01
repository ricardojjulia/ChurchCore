import { queryTenantLocalDb, shouldUseLocalTenantFallback } from "@/lib/supabase/tenant";
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
// Column names (debit_cents / credit_cents) match the live usage in
// autoPostToGl — note those differ from the side/amount_cents schema
// defined in the 20260417 migration; the webhook code is the
// authoritative reference.

export type ReverseGlEntryForRefundInput = {
  churchId: string;
  registrationId: string;
  amountCents: number;
  refundId: string;
  refundedAt: string; // ISO timestamp
  profileId: string | null;
};

export async function reverseGlEntryForRefund(
  input: ReverseGlEntryForRefundInput,
): Promise<void> {
  // Only supported in local-fallback mode — the full Supabase path is a
  // future integration point (same pattern as autoPostToGl in route.ts).
  if (!shouldUseLocalTenantFallback()) {
    console.info(
      "[gl-reversal] Skipping: not in local-fallback mode (registration=%s)",
      input.registrationId,
    );
    return;
  }

  // Find the original journal for this registration (reference = registrationId).
  // autoPostToGl stores registrationId in the finance_journals.reference column.
  const journalResult = await queryTenantLocalDb<{
    id: string;
    description: string;
  }>(
    `select id, description
     from public.finance_journals
     where church_id = $1
       and reference = $2
       and journal_type = 'giving'
       and status = 'posted'
     limit 1`,
    [input.churchId, input.registrationId],
  );
  const originalJournal = journalResult.rows[0];

  if (!originalJournal) {
    // No prior GL posting for this registration — nothing to reverse.
    console.info(
      "[gl-reversal] No prior GL journal found for registration=%s — skipped",
      input.registrationId,
    );
    return;
  }

  // Read the original journal lines so we can swap debit/credit.
  const linesResult = await queryTenantLocalDb<{
    account_id: string;
    debit_cents: number;
    credit_cents: number;
    description: string | null;
  }>(
    `select account_id, debit_cents, credit_cents, description
     from public.finance_journal_lines
     where journal_id = $1
     order by sort_order`,
    [originalJournal.id],
  );
  const originalLines = linesResult.rows;

  if (originalLines.length === 0) {
    console.info(
      "[gl-reversal] Original journal %s has no lines — skipped",
      originalJournal.id,
    );
    return;
  }

  // Create the reversing journal.
  const reversalJournal = await queryTenantLocalDb<{ id: string }>(
    `insert into public.finance_journals
       (church_id, journal_date, description, journal_type, status, reference, posted_by)
     values ($1, current_date, $2, 'giving', 'posted', $3, $4)
     returning id`,
    [
      input.churchId,
      `Refund reversal — ${originalJournal.description}`,
      input.refundId,
      input.profileId,
    ],
  );
  const reversalJournalId = reversalJournal.rows[0]?.id;
  if (!reversalJournalId) return;

  // Insert reversed lines: swap debit_cents and credit_cents.
  for (let i = 0; i < originalLines.length; i++) {
    const line = originalLines[i];
    await queryTenantLocalDb(
      `insert into public.finance_journal_lines
         (journal_id, account_id, description, debit_cents, credit_cents, sort_order)
       values ($1, $2, $3, $4, $5, $6)`,
      [
        reversalJournalId,
        line.account_id,
        line.description ?? `Refund ${input.refundId.slice(-8)}`,
        line.credit_cents,  // swap: original credit becomes debit
        line.debit_cents,   // swap: original debit becomes credit
        i,
      ],
    );
  }
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
