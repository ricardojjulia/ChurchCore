import "server-only";

import { isValidTimeZone } from "@/lib/church-time";
import { isProviderNotConfigured } from "@/lib/notifications/email-provider";
import { sendEmail } from "@/lib/notifications/send-email";
import type { createTenantAdminClient } from "@/lib/supabase/tenant";
import { escapeHtml, RECEIPT_LEASE_MS } from "@/lib/stripe/donation-completion";

/**
 * ChurchCore's own receipt for a paid event registration (G3.3b). Claimed
 * with a lease before it is sent and marked sent only once the provider
 * accepts it, so a webhook retry or concurrent delivery never sends twice.
 * Throws when the provider refuses, so the webhook answers 5xx and Stripe
 * retries. `server-only`: callers pass a trusted church id (ADR 0022).
 */

type AdminClient = ReturnType<typeof createTenantAdminClient>;

export const NOT_A_DONATION_NOTICE =
  "This is a receipt for an event registration fee. It is not a tax-deductible donation receipt.";

export interface RegistrationReceiptDeps {
  sendEmail: typeof sendEmail;
  now: () => Date;
}

const defaultDeps: RegistrationReceiptDeps = { sendEmail, now: () => new Date() };

type PaymentRow = { id: string; amount_cents: number; currency: string | null };
type RegistrationRow = { registrant_name: string | null; registrant_email: string | null };
type EventRow = { title: string | null; starts_at: string | null };
type ChurchRow = { name: string | null; timezone: string | null; mailing_address: string | null; contact_email: string | null };

function formatAmount(amountCents: number, currency: string | null): string {
  const code = (currency ?? "usd").toUpperCase();
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: code }).format(amountCents / 100);
  } catch {
    return `${(amountCents / 100).toFixed(2)} ${code}`;
  }
}

/** The event's start as a real instant, shown in the church's own time zone. */
function formatEventStart(startsAt: string | null, timeZone: string | null): string | null {
  if (!startsAt) return null;
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: timeZone && isValidTimeZone(timeZone) ? timeZone : "UTC",
  }).format(date);
}

/**
 * Emails the registrant their receipt for a succeeded registration payment,
 * once. Does nothing when the payment isn't succeeded, was already receipted,
 * or another attempt holds a fresh claim. Throws on a database error or when
 * the provider refuses the email (the claim is released first).
 */
export async function sendRegistrationReceipt(
  admin: AdminClient,
  churchId: string,
  registrationId: string,
  deps: Partial<RegistrationReceiptDeps> = {},
): Promise<void> {
  const { sendEmail: send, now } = { ...defaultDeps, ...deps };

  const staleBefore = new Date(now().getTime() - RECEIPT_LEASE_MS).toISOString();
  const { data: claimed, error: claimError } = await admin
    .from("event_registration_payments")
    .update({ receipt_claimed_at: now().toISOString() })
    .eq("registration_id", registrationId)
    .eq("church_id", churchId)
    .eq("status", "succeeded")
    .is("receipt_sent_at", null)
    .or(`receipt_claimed_at.is.null,receipt_claimed_at.lt."${staleBefore}"`)
    .select("id, amount_cents, currency");
  if (claimError) throw new Error(claimError.message);
  const payment = (claimed as PaymentRow[] | null)?.[0];
  if (!payment) return;

  const release = async () => {
    const { error } = await admin
      .from("event_registration_payments")
      .update({ receipt_claimed_at: null })
      .eq("id", payment.id)
      .eq("church_id", churchId);
    if (error) console.error("[registration-receipt] could not release claim:", error.message);
  };

  try {
    const { data: registrationData, error: registrationError } = await admin
      .from("event_registrations")
      .select("registrant_name, registrant_email, event_id")
      .eq("id", registrationId)
      .eq("church_id", churchId)
      .maybeSingle();
    if (registrationError) throw new Error(registrationError.message);
    const registration = registrationData as (RegistrationRow & { event_id: string | null }) | null;
    const to = registration?.registrant_email?.trim();
    if (!registration || !to) {
      await release();
      return;
    }

    let event: EventRow | null = null;
    if (registration.event_id) {
      const { data, error } = await admin
        .from("events")
        .select("title, starts_at")
        .eq("id", registration.event_id)
        .eq("church_id", churchId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      event = data as EventRow | null;
    }

    const { data: churchData, error: churchError } = await admin
      .from("churches")
      .select("name, timezone, mailing_address, contact_email")
      .eq("id", churchId)
      .maybeSingle();
    if (churchError) throw new Error(churchError.message);
    const church = churchData as ChurchRow | null;

    const churchName = church?.name?.trim() || "Your church";
    const eventTitle = event?.title?.trim() || "your event";
    const when = formatEventStart(event?.starts_at ?? null, church?.timezone ?? null);
    const name = registration.registrant_name?.trim() || null;
    const amount = formatAmount(payment.amount_cents, payment.currency);
    const greeting = name ? `Dear ${name},` : "Hello,";
    const address = church?.mailing_address?.trim() || null;
    const contact = church?.contact_email?.trim() || null;

    const textLines = [
      greeting,
      "",
      `Thank you for registering for ${eventTitle} at ${churchName}.`,
      "",
      `Event: ${eventTitle}`,
      ...(when ? [`When: ${when}`] : []),
      `Registrant: ${name ?? to}`,
      `Amount paid: ${amount}`,
      `Payment reference: ${payment.id}`,
      "",
      NOT_A_DONATION_NOTICE,
      "",
      churchName,
      ...(address ? [address] : []),
      ...(contact ? [`Contact: ${contact}`] : []),
    ];
    const html = `
      <p>${escapeHtml(greeting)}</p>
      <p>Thank you for registering for <strong>${escapeHtml(eventTitle)}</strong> at ${escapeHtml(churchName)}.</p>
      <p>Event: <strong>${escapeHtml(eventTitle)}</strong><br>${when ? `When: ${escapeHtml(when)}<br>` : ""}Registrant: ${escapeHtml(name ?? to)}<br>Amount paid: <strong>${escapeHtml(amount)}</strong><br>Payment reference: ${escapeHtml(payment.id)}</p>
      <p style="color:#666;font-size:12px;">${escapeHtml(NOT_A_DONATION_NOTICE)}</p>
      <p style="color:#666;font-size:12px;">${escapeHtml(churchName)}${address ? `<br>${escapeHtml(address)}` : ""}${contact ? `<br>Contact: ${escapeHtml(contact)}` : ""}</p>
    `;

    const sent = await send({
      to,
      subject: `Your registration receipt — ${eventTitle}`,
      text: textLines.join("\n"),
      html,
      idempotencyKey: payment.id,
    });
    if (isProviderNotConfigured(sent)) {
      // No email provider yet: leave the receipt unsent, release the claim and
      // don't throw, so the webhook isn't retried for days (Council Review 42).
      await release();
      console.warn("[registration-receipt] email provider not configured; receipt left unsent", { paymentId: payment.id });
      return;
    }
    if (!sent.accepted) throw new Error(`Receipt email refused: ${sent.error ?? "unknown error"}`);
  } catch (error) {
    await release();
    throw error;
  }

  const { error: sentError } = await admin
    .from("event_registration_payments")
    .update({ receipt_sent_at: now().toISOString() })
    .eq("id", payment.id)
    .eq("church_id", churchId);
  if (sentError) throw new Error(sentError.message);
}
