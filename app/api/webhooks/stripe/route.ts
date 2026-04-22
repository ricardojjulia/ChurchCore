import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";

import {
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";
import { getStripeWebhookSecret } from "@/lib/stripe/client";
import { sendEmail } from "@/lib/notifications/send-email";

// ── Signature verification ────────────────────────────────────

function verifyStripeSignature(
  payload: string,
  sigHeader: string,
  secret: string,
): boolean {
  // Stripe-Signature: t=timestamp,v1=hash[,v1=hash...]
  const parts = sigHeader.split(",");
  const tPart = parts.find((p) => p.startsWith("t="));
  const v1Parts = parts.filter((p) => p.startsWith("v1="));

  if (!tPart || v1Parts.length === 0) return false;

  const timestamp = tPart.slice(2);
  const signedPayload = `${timestamp}.${payload}`;
  const expected = createHmac("sha256", secret)
    .update(signedPayload, "utf8")
    .digest("hex");

  return v1Parts.some((v) => {
    const received = v.slice(3);
    try {
      return timingSafeEqual(
        Buffer.from(expected, "hex"),
        Buffer.from(received, "hex"),
      );
    } catch {
      return false;
    }
  });
}

// ── Core donation-succeeded handler ──────────────────────────

async function handlePaymentIntentSucceeded(pi: {
  id: string;
  amount: number;
  currency: string;
  metadata?: { church_id?: string; fund_designation?: string };
  receipt_email?: string;
  customer?: string;
}) {
  const churchId = pi.metadata?.church_id;
  if (!churchId) return;

  if (shouldUseLocalTenantFallback()) {
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
      await sendReceiptEmail(
        recipientEmail,
        donation.donor_name,
        donation.amount_cents,
        donation.fund_designation,
        donation.id,
      );
      await queryTenantLocalDb(
        `update public.donations set receipt_sent_at = now() where id = $1`,
        [donation.id],
      );
    }
    return;
  }

  // Supabase path — requires createTenantServerClient which needs
  // churchId resolution. The webhook arrives without a session, so we
  // use the platform-level Supabase service client to route to the
  // correct tenant.  This is a future integration point; for now the
  // local-fallback path above handles dev/staging and the confirmation
  // client-action (confirmDonationAction) handles prod until the
  // tenant routing plumbing is wired.
  //
  // When full multi-tenant routing via the control-plane is ready,
  // replace this comment with:
  //   const tenantClient = await createTenantClientForChurch(churchId);
  //   then call the same update + GL post + receipt flow.
}

async function handlePaymentIntentFailed(pi: {
  id: string;
  metadata?: { church_id?: string };
}) {
  const churchId = pi.metadata?.church_id;
  if (!churchId || !shouldUseLocalTenantFallback()) return;

  await queryTenantLocalDb(
    `update public.donations
     set status = 'failed', updated_at = now()
     where stripe_payment_intent_id = $1 and church_id = $2 and status = 'pending'`,
    [pi.id, churchId],
  );
}

async function handleSubscriptionDeleted(sub: {
  id: string;
  metadata?: { church_id?: string };
}) {
  const churchId = sub.metadata?.church_id;
  if (!churchId || !shouldUseLocalTenantFallback()) return;

  await queryTenantLocalDb(
    `update public.donations
     set status = 'cancelled', updated_at = now()
     where stripe_subscription_id = $1 and church_id = $2`,
    [sub.id, churchId],
  );
}

// ── GL auto-post ──────────────────────────────────────────────

async function autoPostToGl(
  donationId: string,
  churchId: string,
  amountCents: number,
  fundDesignation: string | null,
) {
  // Skip if already posted
  const existing = await queryTenantLocalDb<{ id: string }>(
    `select id from public.donation_gl_posts where donation_id = $1`,
    [donationId],
  );
  if (existing.rows[0]) return;

  // Look up fund mapping
  const mapping = await queryTenantLocalDb<{
    asset_account_id: string;
    income_account_id: string;
  }>(
    `select asset_account_id, income_account_id
     from public.giving_fund_accounts
     where church_id = $1 and fund_designation = $2 and is_active = true`,
    [churchId, fundDesignation ?? "General"],
  );
  if (!mapping.rows[0]) return; // No mapping — skip silently (admin must configure)

  const { asset_account_id, income_account_id } = mapping.rows[0];

  // Create journal
  const journal = await queryTenantLocalDb<{ id: string }>(
    `insert into public.finance_journals
       (church_id, journal_date, description, journal_type, status, reference)
     values ($1, current_date, $2, 'giving', 'posted', $3)
     returning id`,
    [
      churchId,
      `Online giving — ${fundDesignation ?? "General Fund"}`,
      donationId,
    ],
  );
  const journalId = journal.rows[0]?.id;
  if (!journalId) return;

  // Balanced journal lines: debit asset, credit income
  await queryTenantLocalDb(
    `insert into public.finance_journal_lines
       (journal_id, account_id, description, debit_cents, credit_cents)
     values
       ($1, $2, $3, $4, 0),
       ($1, $5, $3, 0, $4)`,
    [
      journalId,
      asset_account_id,
      `Donation ${donationId.slice(-8)}`,
      amountCents,
      income_account_id,
    ],
  );

  // Record post
  await queryTenantLocalDb(
    `insert into public.donation_gl_posts (church_id, donation_id, journal_id, status)
     values ($1, $2, $3, 'posted')`,
    [churchId, donationId, journalId],
  );
}

// ── Receipt email ─────────────────────────────────────────────

async function sendReceiptEmail(
  to: string,
  donorName: string | null,
  amountCents: number,
  fundDesignation: string | null,
  donationId: string,
) {
  const amount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amountCents / 100);

  const fund = fundDesignation ?? "General Fund";
  const name = donorName ? `${donorName}, thank` : "Thank";

  await sendEmail({
    to,
    subject: `Your gift of ${amount} — receipt`,
    text: `${name} you for your gift of ${amount} to ${fund}. Donation ID: ${donationId}`,
    html: `
      <p>${name} you for your generous gift of <strong>${amount}</strong> to the <strong>${fund}</strong>.</p>
      <p>Donation reference: <code>${donationId.slice(-8).toUpperCase()}</code></p>
      <p style="color:#666;font-size:12px">This is your official giving receipt. Please retain for tax purposes.</p>
    `,
    idempotencyKey: donationId,
  });
}

// ── Route handler ─────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  const webhookSecret = getStripeWebhookSecret();

  // Read raw body as text (required for signature verification)
  const rawBody = await req.text();
  const sigHeader = req.headers.get("stripe-signature") ?? "";

  // Verify signature when secret is configured
  if (webhookSecret) {
    if (!verifyStripeSignature(rawBody, sigHeader, webhookSecret)) {
      console.warn("[stripe-webhook] Invalid signature — rejected");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  let event: { type: string; data: { object: Record<string, unknown> } };
  try {
    event = JSON.parse(rawBody) as typeof event;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
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
        break;

      default:
        // Unhandled event type — acknowledge and ignore
        break;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[stripe-webhook] Handler error:", msg);
    // Return 200 so Stripe does not retry — log for investigation
    return NextResponse.json({ received: true, warning: msg });
  }

  return NextResponse.json({ received: true });
}
