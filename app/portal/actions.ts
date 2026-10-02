"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { resolveRegistrationLifecycle } from "@/lib/event-registration-lifecycle";
import {
  EVENT_PAYMENT_START_FAILED,
  cancelUnpaidRegistration,
  eventPaymentReadiness,
  removeUnstartedRegistration,
  startRegistrationPayment,
  type RegistrationCheckout,
} from "@/lib/event-registration-payment";
import { createEventRegistrationPaymentIntent } from "@/lib/stripe/event-registrations";
import { getRequestedPublicChurch } from "@/lib/public-portal-data";
import { isRateLimited } from "@/lib/rate-limit";
import {
  createTenantAdminClient,
  createTenantServerClient,
  hasTenantBackendEnv,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";
import { hasTenantDbUrl } from "@/lib/supabase/config";

export type SubmitPortalAccountRequestInput = {
  churchId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
};

export type SubmitPublicEventRegistrationInput = {
  churchId: string;
  eventId: string;
  registrantName: string;
  registrantEmail: string;
  registrantPhone?: string | null;
  notes?: string | null;
  customFields?: Record<string, unknown>;
};

export type SubmitPublicEventRegistrationResult = {
  ok: boolean;
  previewMode?: boolean;
  alreadyRegistered?: boolean;
  status?: "pending_approval" | "confirmed" | "waitlisted";
  registrationId?: string | null;
  paymentIntentId?: string | null;
  paymentClientSecret?: string | null;
  /** Stripe's card form for a live paid registration (G3.0c). */
  checkout?: RegistrationCheckout | null;
  error?: string;
};

export async function submitPortalAccountRequestAction(
  input: SubmitPortalAccountRequestInput,
) {
  const resolvedChurch = !input.churchId.trim()
    ? await getRequestedPublicChurch()
    : null;
  const churchId = input.churchId.trim() || resolvedChurch?.id || "";
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const email = input.email.trim().toLowerCase();
  const phone = input.phone?.trim() || null;

  if (!churchId) {
    throw new Error("Select a church before requesting portal access.");
  }

  if (!firstName || !lastName) {
    throw new Error("First and last name are required.");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid email address.");
  }

  if (!hasTenantBackendEnv() && !hasTenantDbUrl()) {
    return { ok: false, error: "Backend not configured. Supabase connection required." };
  }

  if (shouldUseLocalTenantFallback() || !hasTenantBackendEnv()) {
    await queryTenantLocalDb(
      `
        select public.submit_account_request($1, $2, $3, $4, $5)
      `,
      [churchId, email, firstName, lastName, phone],
    );

    return { previewMode: false };
  }

  const supabase = await createTenantServerClient();
  const { error } = await supabase.rpc("submit_account_request", {
    target_church_id: churchId,
    request_email: email,
    request_first_name: firstName,
    request_last_name: lastName,
    request_phone: phone,
  });

  if (error) {
    throw new Error(error.message);
  }

  return { previewMode: false };
}

export async function submitPublicEventRegistrationAction(
  input: SubmitPublicEventRegistrationInput,
): Promise<SubmitPublicEventRegistrationResult> {
  const churchId = input.churchId.trim();
  const eventId = input.eventId.trim();
  const registrantName = input.registrantName.trim();
  const registrantEmail = input.registrantEmail.trim().toLowerCase();
  const registrantPhone = input.registrantPhone?.trim() || null;
  const notes = input.notes?.trim() || null;

  if (!churchId || !eventId) {
    return { ok: false, error: "A church and event are required." };
  }

  if (!registrantName) {
    return { ok: false, error: "Name is required." };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(registrantEmail)) {
    return { ok: false, error: "Enter a valid email address." };
  }

  // A public, unauthenticated write: limit how fast one address can submit.
  const forwardedFor = (await headers()).get("x-forwarded-for") ?? "";
  const ip = forwardedFor.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(`public-registration:${ip}`, 10, 60_000)) {
    return { ok: false, error: "Too many registrations from this connection. Please wait a minute and try again." };
  }

  if (!hasTenantBackendEnv() && !hasTenantDbUrl()) {
    return { ok: false, error: "Backend not configured. Supabase connection required." };
  }

  if (shouldUseLocalTenantFallback() || !hasTenantBackendEnv()) {
    const settingsResult = await queryTenantLocalDb<{
      registration_open: boolean;
      capacity: number | null;
      waitlist_enabled: boolean;
      approval_required: boolean;
      deadline: string | null;
      price_cents: number;
      currency: string | null;
    }>(
      `select
         settings.registration_open,
         settings.capacity,
         settings.waitlist_enabled,
         coalesce(settings.approval_required, false) as approval_required,
         settings.deadline,
         coalesce(settings.price_cents, 0) as price_cents,
         coalesce(settings.currency, 'usd') as currency
       from public.event_registration_settings settings
       join public.events event
         on event.id = settings.event_id
       where settings.church_id = $1
         and settings.event_id = $2
         and event.visibility = 'public'
       limit 1`,
      [churchId, eventId],
    );

    const settings = settingsResult.rows[0];
    if (!settings || !settings.registration_open) {
      return { ok: false, error: "Registration is closed for this event." };
    }

    if (settings.deadline && Date.now() > new Date(settings.deadline).getTime()) {
      return { ok: false, error: "Registration deadline has passed." };
    }

    const existingResult = await queryTenantLocalDb<{ id: string }>(
      `select id
       from public.event_registrations
       where church_id = $1
         and event_id = $2
         and lower(registrant_email) = $3
         and status != 'cancelled'
       limit 1`,
      [churchId, eventId, registrantEmail],
    );

    if (existingResult.rows[0]?.id) {
      return { ok: true, alreadyRegistered: true };
    }

    let isWaitlisted = false;
    if (settings.capacity) {
      const countResult = await queryTenantLocalDb<{ cnt: number }>(
        `select count(*)::int as cnt
         from public.event_registrations
         where church_id = $1
           and event_id = $2
           and is_waitlisted = false
           and status != 'cancelled'`,
        [churchId, eventId],
      );

      if ((countResult.rows[0]?.cnt ?? 0) >= settings.capacity) {
        if (!settings.waitlist_enabled) {
          return { ok: false, error: "This event is full and does not have a waitlist." };
        }
        isWaitlisted = true;
      }
    }

    const { status, paymentStatus } = resolveRegistrationLifecycle({
      isWaitlisted,
      approvalRequired: settings.approval_required,
      priceCents: settings.price_cents,
    });

     const registrationResult = await queryTenantLocalDb<{ id: string }>(
      `insert into public.event_registrations
         (event_id, church_id, registrant_name, registrant_email, registrant_phone,
          status, is_waitlisted, payment_status, notes, custom_fields)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
       returning id`,
      [
        eventId,
        churchId,
        registrantName,
        registrantEmail,
        registrantPhone,
        status,
        isWaitlisted,
        paymentStatus,
        notes,
        input.customFields ? JSON.stringify(input.customFields) : null,
      ],
    );

    const registrationId = registrationResult.rows[0]?.id;
    let paymentIntent:
      | Awaited<ReturnType<typeof createEventRegistrationPaymentIntent>>
      | null = null;
    if (registrationId && paymentStatus === "pending") {
      try {
        paymentIntent = await createEventRegistrationPaymentIntent({
          amountCents: settings.price_cents,
          currency: settings.currency,
          churchId,
          eventId,
          registrationId,
          registrantEmail,
          registrantName,
        });
      } catch {
        paymentIntent = null;
      }

      await queryTenantLocalDb(
        `insert into public.event_registration_payments
           (registration_id, event_id, church_id, provider, status, amount_cents, currency, payment_intent_id)
         values ($1, $2, $3, 'stripe', 'pending', $4, $5, $6)
         on conflict (registration_id)
         do update set
           status = excluded.status,
           amount_cents = excluded.amount_cents,
           currency = excluded.currency,
           payment_intent_id = excluded.payment_intent_id,
           updated_at = now()`,
        [
          registrationId,
          eventId,
          churchId,
          settings.price_cents,
          settings.currency ?? "usd",
          paymentIntent?.paymentIntentId ?? null,
        ],
      );
    }

    revalidatePath(`/portal/events/register?church=${encodeURIComponent(churchId)}`);
    return {
      ok: true,
      status,
      ...(paymentIntent
        ? {
            paymentIntentId: paymentIntent.paymentIntentId,
            paymentClientSecret: paymentIntent.clientSecret,
          }
        : {}),
    };
  }

  // The visitor is signed out, and since S10 anon can't insert into
  // event_registrations (or read the settings, counts or form fields). This
  // action is the only way in: it checks the event is public and open, the
  // deadline, capacity and the waitlist, then writes with the admin client,
  // scoped to the church whose public event this is (ADR 0022).
  const supabase = createTenantAdminClient();

  const { data: settings } = await supabase
    .from("event_registration_settings")
    .select("registration_open, capacity, waitlist_enabled, approval_required, deadline, price_cents, currency, events!inner(id, visibility, church_id)")
    .eq("church_id", churchId)
    .eq("event_id", eventId)
    .eq("events.visibility", "public")
    // The event must be this church's own (PR #171 review; the database
    // guarantees it too since migration 20261002020000).
    .eq("events.church_id", churchId)
    .maybeSingle();

  if (!settings || settings.registration_open === false) {
    return { ok: false, error: "Registration is closed for this event." };
  }

  if (settings.deadline && Date.now() > new Date(settings.deadline).getTime()) {
    return { ok: false, error: "Registration deadline has passed." };
  }

  const { data: existing } = await supabase
    .from("event_registrations")
    .select("id")
    .eq("church_id", churchId)
    .eq("event_id", eventId)
    .ilike("registrant_email", registrantEmail)
    .neq("status", "cancelled")
    .maybeSingle();

  if (existing?.id) {
    return { ok: true, alreadyRegistered: true };
  }

  let isWaitlisted = false;
  if (settings.capacity) {
    const { count } = await supabase
      .from("event_registrations")
      .select("id", { count: "exact", head: true })
      .eq("church_id", churchId)
      .eq("event_id", eventId)
      .eq("is_waitlisted", false)
      .neq("status", "cancelled");

    if ((count ?? 0) >= settings.capacity) {
      if (!settings.waitlist_enabled) {
        return { ok: false, error: "This event is full and does not have a waitlist." };
      }
      isWaitlisted = true;
    }
  }

  // Keep only the custom fields this event defines, and require its required
  // ones: the visitor's payload is otherwise stored as given.
  const { data: fieldRows, error: fieldsError } = await supabase
    .from("event_registration_form_fields")
    .select("field_key, label, field_type, is_required")
    .eq("church_id", churchId)
    .eq("event_id", eventId);
  if (fieldsError) {
    console.error("[public-registration] Couldn't read form fields:", fieldsError.message);
    return { ok: false, error: "Couldn't complete your registration. Please try again." };
  }
  const submitted = input.customFields ?? {};
  const customFields: Record<string, unknown> = {};
  for (const field of (fieldRows ?? []) as Array<{ field_key: string; label: string; field_type: string; is_required: boolean }>) {
    const raw = submitted[field.field_key];
    // A checkbox is checked only by a literal true: "false", 0 or an object
    // must not satisfy a required waiver (PR #171 review).
    const value = field.field_type === "checkbox" ? (raw === true ? true : undefined) : raw;
    const empty = value === undefined || value === null || (typeof value === "string" && value.trim() === "");
    if (field.is_required && empty) {
      return { ok: false, error: `${field.label} is required.` };
    }
    if (!empty) customFields[field.field_key] = value;
  }

  const { status, paymentStatus } = resolveRegistrationLifecycle({
    isWaitlisted,
    approvalRequired: settings.approval_required,
    priceCents: settings.price_cents ?? 0,
  });

  // A paid registration is taken only when the church can take the payment
  // (G3.0c, Council Review 35): nobody is left registered owing a payment
  // they have no way to make.
  if (paymentStatus === "pending") {
    const readiness = await eventPaymentReadiness(churchId);
    if (!readiness.ok) return { ok: false, error: readiness.error };
  }

  const { data, error } = await supabase.from("event_registrations").insert({
    church_id: churchId,
    event_id: eventId,
    registrant_name: registrantName,
    registrant_email: registrantEmail,
    registrant_phone: registrantPhone,
    status,
    is_waitlisted: isWaitlisted,
    payment_status: paymentStatus,
    notes,
    custom_fields: Object.keys(customFields).length ? customFields : null,
  }).select("id").single();

  if (error || !data) {
    // Never show a visitor raw database text.
    console.error("[public-registration] Insert failed:", error?.message);
    return { ok: false, error: "Couldn't complete your registration. Please try again." };
  }

  if (paymentStatus === "pending" && data?.id) {
    let payment: Awaited<ReturnType<typeof startRegistrationPayment>>;
    try {
      payment = await startRegistrationPayment(supabase, {
        churchId,
        eventId,
        registrationId: data.id,
        amountCents: settings.price_cents ?? 0,
        currency: settings.currency,
        registrantEmail,
        registrantName,
      });
    } catch (paymentError) {
      // Stripe or the payment row failed: undo the registration so the
      // visitor can simply try again, rather than leave one nobody can pay.
      console.error(
        "[public-registration] Starting the payment failed:",
        paymentError instanceof Error ? paymentError.message : paymentError,
      );
      await removeUnstartedRegistration(supabase, churchId, data.id);
      return { ok: false, error: EVENT_PAYMENT_START_FAILED };
    }

    revalidatePath(`/portal/events/register?church=${encodeURIComponent(churchId)}`);
    return {
      ok: true,
      status,
      registrationId: data.id,
      paymentIntentId: payment.paymentIntentId,
      ...(payment.checkout ? { paymentClientSecret: payment.checkout.clientSecret, checkout: payment.checkout } : {}),
    };
  }

  revalidatePath(`/portal/events/register?church=${encodeURIComponent(churchId)}`);
  return { ok: true, status, registrationId: data.id };
}

/**
 * The visitor left the card step without paying (G3.0c): cancel the
 * PaymentIntent and the registration, freeing its place. The visitor is
 * signed out, so the proof is holding both the registration id and its
 * PaymentIntent id, which only the registrant's browser was given; and it
 * acts only while that registration's payment is still pending.
 */
export async function cancelUnpaidPublicRegistrationAction(
  registrationId: string,
  paymentIntentId: string,
): Promise<{ ok: boolean; cancelled: boolean; error?: string }> {
  if (!registrationId || !paymentIntentId) return { ok: true, cancelled: false };
  return cancelUnpaidRegistration(createTenantAdminClient(), { registrationId, paymentIntentId });
}
