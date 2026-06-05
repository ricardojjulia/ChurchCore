"use server";

import { revalidatePath } from "next/cache";

import { requireChurchSession } from "@/lib/auth";
import { resolveRegistrationLifecycle } from "@/lib/event-registration-lifecycle";
import { createEventRegistrationPaymentIntent } from "@/lib/stripe/event-registrations";
import {
  createTenantServerClient,
  hasTenantBackendEnv,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";

export type MemberMobileCheckInInput = {
  eventId: string;
  accessCode?: string | null;
  targetProfileId?: string | null;
  deviceLatitude?: number | null;
  deviceLongitude?: number | null;
};

export type MemberMobileCheckInResult = {
  ok: boolean;
  alreadyCheckedIn?: boolean;
  previewMode?: boolean;
  error?: string;
};

type CheckInGate = {
  title: string;
  windowStartAt: string;
  windowEndAt: string;
  accessCode: string | null;
  allowHouseholdCheckIn: boolean;
  locationLat: number | null;
  locationLng: number | null;
  locationRadiusMeters: number | null;
};

type CheckInProfile = {
  id: string;
  family_id: string | null;
};

export type MemberRegisterForEventInput = {
  eventId: string;
  targetProfileId?: string | null;
  notes?: string | null;
  customFields?: Record<string, unknown>;
};

export type MemberRegisterForEventResult = {
  ok: boolean;
  previewMode?: boolean;
  alreadyRegistered?: boolean;
  status?: "pending_approval" | "confirmed" | "waitlisted";
  paymentIntentId?: string | null;
  paymentClientSecret?: string | null;
  error?: string;
};

function assertWindowOpen(gate: CheckInGate) {
  const now = Date.now();
  const startsAt = new Date(gate.windowStartAt).getTime();
  const endsAt = new Date(gate.windowEndAt).getTime();

  if (Number.isNaN(startsAt) || Number.isNaN(endsAt)) {
    throw new Error("Mobile member check-in is not configured for this event yet.");
  }

  if (now < startsAt) {
    throw new Error("Check-in has not opened for this event yet.");
  }

  if (now > endsAt) {
    throw new Error("Check-in window is closed for this event.");
  }
}

function assertAccessCode(gate: CheckInGate, providedCode?: string | null) {
  if (!gate.accessCode || gate.accessCode.trim().length === 0) {
    return;
  }

  if (!providedCode || providedCode.trim() !== gate.accessCode.trim()) {
    throw new Error("A valid check-in access code is required.");
  }
}

function haversineMeters(
  leftLat: number,
  leftLng: number,
  rightLat: number,
  rightLng: number,
) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusMeters = 6371000;
  const dLat = toRadians(rightLat - leftLat);
  const dLng = toRadians(rightLng - leftLng);
  const lat1 = toRadians(leftLat);
  const lat2 = toRadians(rightLat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusMeters * c;
}

function assertLocation(
  gate: CheckInGate,
  payload: {
    deviceLatitude?: number | null;
    deviceLongitude?: number | null;
  },
) {
  if (gate.locationLat == null || gate.locationLng == null || gate.locationRadiusMeters == null) {
    return;
  }

  const gateLat = Number(gate.locationLat);
  const gateLng = Number(gate.locationLng);
  const gateRadius = Number(gate.locationRadiusMeters);

  if (!Number.isFinite(gateLat) || !Number.isFinite(gateLng) || !Number.isFinite(gateRadius)) {
    return;
  }

  if (
    payload.deviceLatitude === undefined ||
    payload.deviceLatitude === null ||
    payload.deviceLongitude === undefined ||
    payload.deviceLongitude === null
  ) {
    throw new Error("Check-in location verification is required for this event.");
  }

  const deviceLatitude = Number(payload.deviceLatitude);
  const deviceLongitude = Number(payload.deviceLongitude);

  if (!Number.isFinite(deviceLatitude) || !Number.isFinite(deviceLongitude)) {
    throw new Error("Check-in location verification is required for this event.");
  }

  if (deviceLatitude < -90 || deviceLatitude > 90) {
    throw new Error("Check-in location verification failed due to invalid latitude.");
  }

  if (deviceLongitude < -180 || deviceLongitude > 180) {
    throw new Error("Check-in location verification failed due to invalid longitude.");
  }

  const distance = haversineMeters(
    gateLat,
    gateLng,
    deviceLatitude,
    deviceLongitude,
  );

  if (distance > gateRadius) {
    throw new Error("You must be on-site to check in for this event.");
  }
}

export async function memberMobileCheckInAction(
  input: MemberMobileCheckInInput,
): Promise<MemberMobileCheckInResult> {
  if (!input.eventId.trim()) {
    return { ok: false, error: "An event is required." };
  }

  const session = await requireChurchSession("/app/member/schedule");

  if (session.appContext.roleId !== "member") {
    return { ok: false, error: "Member access is required." };
  }

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    return { ok: false, error: "Backend not configured. Supabase connection required." };
  }

  const churchId = session.appContext.church.id;
  const profileId = session.profile.id;
  const targetProfileId = input.targetProfileId?.trim() || profileId;

  async function assertHouseholdAccess(
    gate: CheckInGate,
    currentProfile: CheckInProfile,
    targetProfile: CheckInProfile,
  ) {
    if (targetProfile.id === currentProfile.id) {
      return;
    }

    if (!gate.allowHouseholdCheckIn) {
      throw new Error("Household check-in is not enabled for this event.");
    }

    if (!currentProfile.family_id || currentProfile.family_id !== targetProfile.family_id) {
      throw new Error("You can only check in members from your own household.");
    }
  }

  if (shouldUseLocalTenantFallback()) {
    const gateResult = await queryTenantLocalDb<{
      title: string;
      starts_at: string;
      ends_at: string;
      mobile_member_check_in_starts_at: string | null;
      mobile_member_check_in_ends_at: string | null;
      mobile_member_check_in_access_code: string | null;
      mobile_member_check_in_allow_household: boolean;
      mobile_member_check_in_location_lat: number | null;
      mobile_member_check_in_location_lng: number | null;
      mobile_member_check_in_location_radius_meters: number | null;
    }>(
      `
        select
          event.title,
          event.starts_at,
          event.ends_at,
          settings.mobile_member_check_in_starts_at,
          settings.mobile_member_check_in_ends_at,
          settings.mobile_member_check_in_access_code,
          settings.mobile_member_check_in_allow_household,
          settings.mobile_member_check_in_location_lat,
          settings.mobile_member_check_in_location_lng,
          settings.mobile_member_check_in_location_radius_meters
        from public.event_registration_settings settings
        join public.events event
          on event.id = settings.event_id
        where event.id = $1
          and event.church_id = $2
          and event.visibility in ('public', 'members')
          and settings.mobile_member_check_in_enabled = true
        limit 1
      `,
      [input.eventId, churchId],
    );

    const gateRow = gateResult.rows[0];

    if (!gateRow) {
      return { ok: false, error: "Mobile member check-in is not enabled for this event." };
    }

    const gate: CheckInGate = {
      title: gateRow.title,
      windowStartAt: gateRow.mobile_member_check_in_starts_at ?? gateRow.starts_at,
      windowEndAt: gateRow.mobile_member_check_in_ends_at ?? gateRow.ends_at,
      accessCode: gateRow.mobile_member_check_in_access_code,
      allowHouseholdCheckIn: gateRow.mobile_member_check_in_allow_household,
      locationLat: gateRow.mobile_member_check_in_location_lat,
      locationLng: gateRow.mobile_member_check_in_location_lng,
      locationRadiusMeters: gateRow.mobile_member_check_in_location_radius_meters,
    };

    const currentProfileResult = await queryTenantLocalDb<CheckInProfile>(
      `
        select id, family_id
        from public.profiles
        where id = $1
          and church_id = $2
          and merged_at is null
        limit 1
      `,
      [profileId, churchId],
    );

    const targetProfileResult =
      targetProfileId === profileId
        ? currentProfileResult
        : await queryTenantLocalDb<CheckInProfile>(
            `
              select id, family_id
              from public.profiles
              where id = $1
                and church_id = $2
                and merged_at is null
              limit 1
            `,
            [targetProfileId, churchId],
          );

    const currentProfile = currentProfileResult.rows[0];
    const targetProfile = targetProfileResult.rows[0];

    if (!currentProfile || !targetProfile) {
      return { ok: false, error: "A valid household member could not be found." };
    }

    try {
      assertWindowOpen(gate);
      assertAccessCode(gate, input.accessCode);
      assertLocation(gate, input);
      await assertHouseholdAccess(gate, currentProfile, targetProfile);
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Check-in is not available.",
      };
    }

    const existing = await queryTenantLocalDb<{ id: string }>(
      `
        select id
        from public.attendance
        where church_id = $1
          and event_id = $2
          and profile_id = $3
          and status = 'present'
        limit 1
      `,
      [churchId, input.eventId, targetProfile.id],
    );

    if (existing.rows[0]?.id) {
      return { ok: true, alreadyCheckedIn: true };
    }

    await queryTenantLocalDb(
      `
        insert into public.attendance (
          church_id,
          event_id,
          profile_id,
          status,
          check_in_method
        )
        values ($1, $2, $3, 'present', 'mobile_member')
        on conflict (event_id, profile_id)
        where status = 'present'
        do nothing
      `,
      [churchId, input.eventId, targetProfile.id],
    );

    revalidatePath("/app/member");
    revalidatePath("/app/member/schedule");
    revalidatePath(`/app/church-admin/events/${input.eventId}`);
    revalidatePath("/app/reports/events");

    return { ok: true, alreadyCheckedIn: false };
  }

  const supabase = await createTenantServerClient();

  const { data: gateRow, error: gateError } = await supabase
    .from("event_registration_settings")
    .select(
      "mobile_member_check_in_enabled, mobile_member_check_in_starts_at, mobile_member_check_in_ends_at, mobile_member_check_in_access_code, mobile_member_check_in_allow_household, mobile_member_check_in_location_lat, mobile_member_check_in_location_lng, mobile_member_check_in_location_radius_meters, events!inner(id, title, starts_at, ends_at, visibility, church_id)",
    )
    .eq("event_id", input.eventId)
    .eq("church_id", churchId)
    .eq("mobile_member_check_in_enabled", true)
    .maybeSingle();

  if (gateError) {
    return { ok: false, error: gateError.message };
  }

  const eventRecord = gateRow?.events
    ? Array.isArray(gateRow.events)
      ? gateRow.events[0]
      : gateRow.events
    : null;

  if (!gateRow || !eventRecord) {
    return { ok: false, error: "Mobile member check-in is not enabled for this event." };
  }

  if (eventRecord.visibility !== "members" && eventRecord.visibility !== "public") {
    return { ok: false, error: "This event does not allow member check-in." };
  }

  const gate: CheckInGate = {
    title: eventRecord.title,
    windowStartAt: gateRow.mobile_member_check_in_starts_at ?? eventRecord.starts_at,
    windowEndAt: gateRow.mobile_member_check_in_ends_at ?? eventRecord.ends_at,
    accessCode: gateRow.mobile_member_check_in_access_code,
    allowHouseholdCheckIn: gateRow.mobile_member_check_in_allow_household ?? false,
    locationLat: gateRow.mobile_member_check_in_location_lat ?? null,
    locationLng: gateRow.mobile_member_check_in_location_lng ?? null,
    locationRadiusMeters: gateRow.mobile_member_check_in_location_radius_meters ?? null,
  };

  const { data: profileRows, error: profileError } = await supabase
    .from("profiles")
    .select("id, family_id")
    .in("id", targetProfileId === profileId ? [profileId] : [profileId, targetProfileId])
    .eq("church_id", churchId)
    .is("merged_at", null);

  if (profileError) {
    return { ok: false, error: profileError.message };
  }

  const currentProfile = profileRows?.find((row) => row.id === profileId) ?? null;
  const targetProfile = profileRows?.find((row) => row.id === targetProfileId) ?? null;

  if (!currentProfile || !targetProfile) {
    return { ok: false, error: "A valid household member could not be found." };
  }

  try {
    assertWindowOpen(gate);
    assertAccessCode(gate, input.accessCode);
    assertLocation(gate, input);
    await assertHouseholdAccess(gate, currentProfile, targetProfile);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Check-in is not available.",
    };
  }

  const { data: existing, error: existingError } = await supabase
    .from("attendance")
    .select("id")
    .eq("church_id", churchId)
    .eq("event_id", input.eventId)
    .eq("profile_id", targetProfileId)
    .eq("status", "present")
    .maybeSingle();

  if (existingError) {
    return { ok: false, error: existingError.message };
  }

  if (existing?.id) {
    return { ok: true, alreadyCheckedIn: true };
  }

  const { error: insertError } = await supabase.from("attendance").insert({
    church_id: churchId,
    event_id: input.eventId,
    profile_id: targetProfileId,
    status: "present",
    check_in_method: "mobile_member",
  });

  if (insertError) {
    return { ok: false, error: insertError.message };
  }

  revalidatePath("/app/member");
  revalidatePath("/app/member/schedule");
  revalidatePath(`/app/church-admin/events/${input.eventId}`);
  revalidatePath("/app/reports/events");

  return { ok: true, alreadyCheckedIn: false };
}

export async function memberRegisterForEventAction(
  input: MemberRegisterForEventInput,
): Promise<MemberRegisterForEventResult> {
  if (!input.eventId.trim()) {
    return { ok: false, error: "An event is required." };
  }

  const session = await requireChurchSession("/app/member");

  if (session.appContext.roleId !== "member") {
    return { ok: false, error: "Member access is required." };
  }

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    return { ok: false, error: "Backend not configured. Supabase connection required." };
  }

  const churchId = session.appContext.church.id;
  const profileId = session.profile.id;
  const targetProfileId = input.targetProfileId?.trim() || profileId;

  if (shouldUseLocalTenantFallback()) {
    const settingsResult = await queryTenantLocalDb<{
      event_title: string;
      starts_at: string;
      ends_at: string;
      registration_open: boolean;
      capacity: number | null;
      waitlist_enabled: boolean;
      approval_required: boolean;
      household_registration_enabled: boolean;
      deadline: string | null;
      price_cents: number;
      currency: string | null;
    }>(
      `select
         event.title as event_title,
         event.starts_at,
         event.ends_at,
         settings.registration_open,
         settings.capacity,
         settings.waitlist_enabled,
         coalesce(settings.approval_required, false) as approval_required,
         coalesce(settings.household_registration_enabled, false) as household_registration_enabled,
         settings.deadline,
        coalesce(settings.price_cents, 0) as price_cents,
        coalesce(settings.currency, 'usd') as currency
       from public.event_registration_settings settings
       join public.events event
         on event.id = settings.event_id
       where settings.event_id = $1
         and settings.church_id = $2
         and event.visibility in ('public', 'members')
       limit 1`,
      [input.eventId, churchId],
    );

    const settings = settingsResult.rows[0];
    if (!settings || !settings.registration_open) {
      return { ok: false, error: "Registration is closed for this event." };
    }

    if (settings.deadline && Date.now() > new Date(settings.deadline).getTime()) {
      return { ok: false, error: "Registration deadline has passed." };
    }

    const currentProfileResult = await queryTenantLocalDb<{
      id: string;
      full_name: string;
      email: string | null;
      phone: string | null;
      family_id: string | null;
    }>(
      `select id, full_name, email, phone, family_id
       from public.profiles
       where id = $1 and church_id = $2 and merged_at is null
       limit 1`,
      [profileId, churchId],
    );

    const targetProfileResult =
      targetProfileId === profileId
        ? currentProfileResult
        : await queryTenantLocalDb<{
            id: string;
            full_name: string;
            email: string | null;
            phone: string | null;
            family_id: string | null;
          }>(
            `select id, full_name, email, phone, family_id
             from public.profiles
             where id = $1 and church_id = $2 and merged_at is null
             limit 1`,
            [targetProfileId, churchId],
          );

    const currentProfile = currentProfileResult.rows[0];
    const targetProfile = targetProfileResult.rows[0];
    if (!currentProfile || !targetProfile) {
      return { ok: false, error: "A valid household member could not be found." };
    }

    if (targetProfile.id !== currentProfile.id) {
      if (!settings.household_registration_enabled) {
        return { ok: false, error: "Household registration is not enabled for this event." };
      }

      if (!currentProfile.family_id || currentProfile.family_id !== targetProfile.family_id) {
        return { ok: false, error: "You can only register members from your own household." };
      }
    }

    const existingResult = await queryTenantLocalDb<{ id: string }>(
      `select id
       from public.event_registrations
       where event_id = $1
         and church_id = $2
         and profile_id = $3
         and status != 'cancelled'
       limit 1`,
      [input.eventId, churchId, targetProfile.id],
    );

    if (existingResult.rows[0]?.id) {
      return { ok: true, alreadyRegistered: true };
    }

    let isWaitlisted = false;
    if (settings.capacity) {
      const countResult = await queryTenantLocalDb<{ cnt: number }>(
        `select count(*)::int as cnt
         from public.event_registrations
         where event_id = $1
           and church_id = $2
           and is_waitlisted = false
           and status != 'cancelled'`,
        [input.eventId, churchId],
      );

      const count = countResult.rows[0]?.cnt ?? 0;
      if (count >= settings.capacity) {
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
         (event_id, church_id, profile_id, registrant_name, registrant_email, registrant_phone,
          status, is_waitlisted, payment_status, notes, custom_fields)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
      returning id`,
      [
        input.eventId,
        churchId,
        targetProfile.id,
        targetProfile.full_name,
        targetProfile.email,
        targetProfile.phone,
        status,
        isWaitlisted,
        paymentStatus,
        input.notes ?? null,
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
          eventId: input.eventId,
          registrationId,
          registrantEmail: targetProfile.email,
          registrantName: targetProfile.full_name,
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
          input.eventId,
          churchId,
          settings.price_cents,
          settings.currency ?? "usd",
          paymentIntent?.paymentIntentId ?? null,
        ],
      );
    }

    revalidatePath("/app/member");
    revalidatePath(`/app/church-admin/events/${input.eventId}`);
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

  const supabase = await createTenantServerClient();

  const { data: settings } = await supabase
    .from("event_registration_settings")
    .select("registration_open, capacity, waitlist_enabled, approval_required, household_registration_enabled, deadline, price_cents, currency, events!inner(id, visibility)")
    .eq("event_id", input.eventId)
    .eq("church_id", churchId)
    .maybeSingle();

  if (!settings || settings.registration_open === false) {
    return { ok: false, error: "Registration is closed for this event." };
  }

  if (settings.deadline && Date.now() > new Date(settings.deadline).getTime()) {
    return { ok: false, error: "Registration deadline has passed." };
  }

  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("id, full_name, email, phone, family_id")
    .eq("id", profileId)
    .eq("church_id", churchId)
    .is("merged_at", null)
    .maybeSingle();

  const { data: targetProfile } = targetProfileId === profileId
    ? { data: currentProfile }
    : await supabase
        .from("profiles")
        .select("id, full_name, email, phone, family_id")
        .eq("id", targetProfileId)
        .eq("church_id", churchId)
        .is("merged_at", null)
        .maybeSingle();

  if (!currentProfile || !targetProfile) {
    return { ok: false, error: "A valid household member could not be found." };
  }

  if (targetProfile.id !== currentProfile.id) {
    if (!settings.household_registration_enabled) {
      return { ok: false, error: "Household registration is not enabled for this event." };
    }

    if (!currentProfile.family_id || currentProfile.family_id !== targetProfile.family_id) {
      return { ok: false, error: "You can only register members from your own household." };
    }
  }

  const { data: existing } = await supabase
    .from("event_registrations")
    .select("id")
    .eq("event_id", input.eventId)
    .eq("church_id", churchId)
    .eq("profile_id", targetProfile.id)
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
      .eq("event_id", input.eventId)
      .eq("church_id", churchId)
      .eq("is_waitlisted", false)
      .neq("status", "cancelled");

    if ((count ?? 0) >= settings.capacity) {
      if (!settings.waitlist_enabled) {
        return { ok: false, error: "This event is full and does not have a waitlist." };
      }
      isWaitlisted = true;
    }
  }

  const { status, paymentStatus } = resolveRegistrationLifecycle({
    isWaitlisted,
    approvalRequired: settings.approval_required,
    priceCents: settings.price_cents ?? 0,
  });

  const { data, error } = await supabase.from("event_registrations").insert({
    event_id: input.eventId,
    church_id: churchId,
    profile_id: targetProfile.id,
    registrant_name: targetProfile.full_name,
    registrant_email: targetProfile.email,
    registrant_phone: targetProfile.phone,
    status,
    is_waitlisted: isWaitlisted,
    payment_status: paymentStatus,
    notes: input.notes ?? null,
    custom_fields: input.customFields ?? null,
  }).select("id").single();

  if (error) {
    return { ok: false, error: error.message };
  }

  if (paymentStatus === "pending" && data?.id) {
    let paymentIntent:
      | Awaited<ReturnType<typeof createEventRegistrationPaymentIntent>>
      | null = null;
    try {
      paymentIntent = await createEventRegistrationPaymentIntent({
        amountCents: settings.price_cents ?? 0,
        currency: settings.currency,
        churchId,
        eventId: input.eventId,
        registrationId: data.id,
        registrantEmail: targetProfile.email,
        registrantName: targetProfile.full_name,
      });
    } catch {
      paymentIntent = null;
    }

    await supabase.from("event_registration_payments").upsert(
      {
        registration_id: data.id,
        event_id: input.eventId,
        church_id: churchId,
        provider: "stripe",
        status: "pending",
        amount_cents: settings.price_cents ?? 0,
        currency: settings.currency ?? "usd",
        payment_intent_id: paymentIntent?.paymentIntentId ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "registration_id" },
    );

    revalidatePath("/app/member");
    revalidatePath(`/app/church-admin/events/${input.eventId}`);
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

  revalidatePath("/app/member");
  revalidatePath(`/app/church-admin/events/${input.eventId}`);
  return { ok: true, status };
}
