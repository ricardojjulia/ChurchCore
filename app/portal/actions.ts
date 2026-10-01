"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { resolveRegistrationLifecycle } from "@/lib/event-registration-lifecycle";
import { createEventRegistrationPaymentIntent, stubPaymentIntentId } from "@/lib/stripe/event-registrations";
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
    .select("registration_open, capacity, waitlist_enabled, approval_required, deadline, price_cents, currency, events!inner(id, visibility)")
    .eq("church_id", churchId)
    .eq("event_id", eventId)
    .eq("events.visibility", "public")
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
    .select("field_key, label, is_required")
    .eq("church_id", churchId)
    .eq("event_id", eventId);
  if (fieldsError) {
    console.error("[public-registration] Couldn't read form fields:", fieldsError.message);
    return { ok: false, error: "Couldn't complete your registration. Please try again." };
  }
  const submitted = input.customFields ?? {};
  const customFields: Record<string, unknown> = {};
  for (const field of (fieldRows ?? []) as Array<{ field_key: string; label: string; is_required: boolean }>) {
    const value = submitted[field.field_key];
    // An unchecked checkbox arrives as false: a required one must be checked.
    const empty =
      value === undefined || value === null || value === false || (typeof value === "string" && value.trim() === "");
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
    const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
    let paymentIntent:
      | Awaited<ReturnType<typeof createEventRegistrationPaymentIntent>>
      | null = null;
    if (!demoMode) {
      try {
        paymentIntent = await createEventRegistrationPaymentIntent({
          amountCents: settings.price_cents ?? 0,
          currency: settings.currency,
          churchId,
          eventId,
          registrationId: data.id,
          registrantEmail,
          registrantName,
        });
      } catch {
        paymentIntent = null;
      }
    }

    // Demo mode records the stub id, the only one the demo payment route
    // completes (S4); a different id left demo payments uncompletable.
    const intentId = paymentIntent?.paymentIntentId ?? (demoMode ? stubPaymentIntentId(data.id) : null);

    const { error: paymentRowError } = await supabase.from("event_registration_payments").upsert(
      {
        registration_id: data.id,
        event_id: eventId,
        church_id: churchId,
        provider: "stripe",
        status: "pending",
        amount_cents: settings.price_cents ?? 0,
        currency: settings.currency ?? "usd",
        payment_intent_id: intentId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "registration_id" },
    );
    if (paymentRowError) {
      // Without its payment row a paid registration could never be paid:
      // undo it so the visitor can simply try again.
      console.error("[public-registration] Payment row failed:", paymentRowError.message);
      await supabase.from("event_registrations").delete().eq("id", data.id).eq("church_id", churchId);
      return { ok: false, error: "Couldn't complete your registration. Please try again." };
    }

    revalidatePath(`/portal/events/register?church=${encodeURIComponent(churchId)}`);
    return {
      ok: true,
      status,
      registrationId: data.id,
      ...(intentId ? { paymentIntentId: intentId } : {}),
      ...(paymentIntent ? { paymentClientSecret: paymentIntent.clientSecret } : {}),
    };
  }

  revalidatePath(`/portal/events/register?church=${encodeURIComponent(churchId)}`);
  return { ok: true, status, registrationId: data.id };
}
