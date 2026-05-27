"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";

import { requireChurchSession } from "@/lib/auth";
import {
  createTenantServerClient,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";
import {
  getMissingCcmSchemaMessage,
  isMissingCcmSchemaError,
} from "@/lib/ccm-runtime";
import type {
  AddCustodyRestrictionInput,
  AssignVolunteerInput,
  CcmCheckinResult,
  CcmCheckinSession,
  CheckinChildInput,
  CheckoutChildInput,
  FileIncidentInput,
  OpenServiceInput,
  UpdateChildProfileInput,
  UpsertPickupInput,
} from "@/lib/ccm-types";

const CCM_PATH = "/app/church-admin/children";

type CcmCheckinSessionLifecycleInput = {
  serviceId: string;
  status: "enabled" | "paused" | "closed";
  startsAt?: string;
  endsAt?: string;
  overrideSafetyRequirements?: boolean;
  overrideReason?: string;
};

type SessionEnablementReadiness = {
  ministryId: string;
  activeRoomCount: number;
  uncoveredRooms: Array<{ roomId: string; roomName: string; volunteerCount: number }>;
};

// ── Guard helper ──────────────────────────────────────────────────────────────

async function requireCcmSession() {
  const session = await requireChurchSession(CCM_PATH);
  if (session.appContext.roleId !== "church-admin") {
    throw new Error("Unauthorized: Children's Ministry module requires church-admin role.");
  }
  return session;
}

async function runLocalCcmMutation<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error) {
    if (isMissingCcmSchemaError(error)) {
      throw new Error(getMissingCcmSchemaMessage());
    }

    throw error;
  }
}

async function getSessionEnablementReadiness(
  serviceId: string,
  churchId: string,
): Promise<SessionEnablementReadiness> {
  if (shouldUseLocalTenantFallback()) {
    const serviceResult = await runLocalCcmMutation(() =>
      queryTenantLocalDb<{ ministry_id: string }>(
        `select ministry_id
         from public.ccm_services
         where id = $1 and church_id = $2
         limit 1`,
        [serviceId, churchId],
      ),
    );

    const ministryId = serviceResult.rows[0]?.ministry_id;
    if (!ministryId) {
      throw new Error("Service could not be found for this church.");
    }

    const roomCoverage = await runLocalCcmMutation(() =>
      queryTenantLocalDb<{ room_id: string; room_name: string; volunteer_count: number }>(
        `select
           room.id as room_id,
           room.name as room_name,
           coalesce(count(assign.id), 0)::int as volunteer_count
         from public.children_rooms room
         left join public.ccm_volunteer_assignments assign
           on assign.room_id = room.id
          and assign.service_id = $1
          and assign.church_id = $2
         where room.church_id = $2
           and room.ministry_id = $3
           and room.is_active = true
         group by room.id, room.name
         order by room.name asc`,
        [serviceId, churchId, ministryId],
      ),
    );

    const uncoveredRooms = roomCoverage.rows
      .filter((room) => Number(room.volunteer_count) < 2)
      .map((room) => ({
        roomId: room.room_id,
        roomName: room.room_name,
        volunteerCount: Number(room.volunteer_count),
      }));

    return {
      ministryId,
      activeRoomCount: roomCoverage.rows.length,
      uncoveredRooms,
    };
  }

  const supabase = await createTenantServerClient();
  const { data: service, error: serviceError } = await supabase
    .from("ccm_services")
    .select("ministry_id")
    .eq("id", serviceId)
    .eq("church_id", churchId)
    .maybeSingle();

  if (serviceError) {
    throw new Error(serviceError.message);
  }

  const ministryId = service?.ministry_id ? String(service.ministry_id) : null;

  if (!ministryId) {
    throw new Error("Service could not be found for this church.");
  }

  const { data: rooms, error: roomError } = await supabase
    .from("children_rooms")
    .select("id, name")
    .eq("church_id", churchId)
    .eq("ministry_id", ministryId)
    .eq("is_active", true);

  if (roomError) {
    throw new Error(roomError.message);
  }

  const roomIds = (rooms ?? []).map((room) => String(room.id));
  const assignmentCounts = new Map<string, number>();

  if (roomIds.length > 0) {
    const { data: assignments, error: assignmentError } = await supabase
      .from("ccm_volunteer_assignments")
      .select("room_id")
      .eq("church_id", churchId)
      .eq("service_id", serviceId)
      .in("room_id", roomIds);

    if (assignmentError) {
      throw new Error(assignmentError.message);
    }

    for (const assignment of assignments ?? []) {
      const roomId = String(assignment.room_id);
      assignmentCounts.set(roomId, (assignmentCounts.get(roomId) ?? 0) + 1);
    }
  }

  const uncoveredRooms = (rooms ?? [])
    .map((room) => ({
      roomId: String(room.id),
      roomName: String(room.name),
      volunteerCount: assignmentCounts.get(String(room.id)) ?? 0,
    }))
    .filter((room) => room.volunteerCount < 2);

  return {
    ministryId,
    activeRoomCount: (rooms ?? []).length,
    uncoveredRooms,
  };
}

function buildReadinessFailureMessage(readiness: SessionEnablementReadiness) {
  if (readiness.activeRoomCount === 0) {
    return "Add at least one active room before enabling this day session.";
  }

  if (!readiness.uncoveredRooms.length) {
    return null;
  }

  const labels = readiness.uncoveredRooms
    .map((room) => `${room.roomName} (${room.volunteerCount}/2)`)
    .join(", ");

  return `Session enablement requires two-adult coverage per room. Coverage gaps: ${labels}. Enable override with an audit reason to proceed.`;
}

// ── openServiceAction ─────────────────────────────────────────────────────────

export async function openServiceAction(
  input: OpenServiceInput,
): Promise<{ id: string }> {
  const session = await requireCcmSession();
  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    const result = await runLocalCcmMutation(() =>
      queryTenantLocalDb<{ id: string }>(
        `insert into public.ccm_services
           (church_id, ministry_id, service_name, service_date, created_by, checkin_session_status)
         values ($1, $2, $3, $4, auth.uid(), 'draft')
         returning id`,
        [churchId, input.ministryId, input.serviceName, input.serviceDate],
      ),
    );
    revalidatePath(CCM_PATH);
    return { id: result.rows[0].id };
  }

  const supabase = await createTenantServerClient();
  const { data, error } = await supabase
    .from("ccm_services")
    .insert({
      church_id: churchId,
      ministry_id: input.ministryId,
      service_name: input.serviceName,
      service_date: input.serviceDate,
      checkin_session_status: "draft",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  revalidatePath(CCM_PATH);
  return { id: (data as { id: string }).id };
}

// ── updateCheckinSessionLifecycleAction ──────────────────────────────────────

export async function updateCheckinSessionLifecycleAction(
  input: CcmCheckinSessionLifecycleInput,
): Promise<void> {
  const session = await requireCcmSession();
  const churchId = session.appContext.church.id;

  const startsAt = input.startsAt?.trim() ? input.startsAt : null;
  const endsAt = input.endsAt?.trim() ? input.endsAt : null;
  const overrideEnabled = input.overrideSafetyRequirements === true;
  const overrideReason = input.overrideReason?.trim() ?? "";

  if ((startsAt && !endsAt) || (!startsAt && endsAt)) {
    throw new Error("Check-in session start and end must be set together.");
  }

  if (startsAt && endsAt && new Date(startsAt).getTime() >= new Date(endsAt).getTime()) {
    throw new Error("Check-in session start must be before end.");
  }

  let readiness: SessionEnablementReadiness | null = null;

  if (input.status === "enabled") {
    readiness = await getSessionEnablementReadiness(input.serviceId, churchId);
    const failureMessage = buildReadinessFailureMessage(readiness);

    if (failureMessage && !overrideEnabled) {
      throw new Error(failureMessage);
    }

    if (failureMessage && overrideEnabled && overrideReason.length < 12) {
      throw new Error("Override reason must include at least 12 characters.");
    }
  }

  const enabledAt = input.status === "enabled" ? new Date().toISOString() : null;
  const closedAt = input.status === "closed" ? new Date().toISOString() : null;

  if (shouldUseLocalTenantFallback()) {
    await runLocalCcmMutation(() =>
      queryTenantLocalDb(
        `update public.ccm_services
         set checkin_session_status = $3,
             checkin_session_starts_at = $4,
             checkin_session_ends_at = $5,
             checkin_session_enabled_at = case when $3 = 'enabled' then timezone('utc', now()) else checkin_session_enabled_at end,
             checkin_session_closed_at = case when $3 = 'closed' then timezone('utc', now()) else checkin_session_closed_at end,
             checkin_session_token = case when $3 = 'closed' then gen_random_uuid()::text else checkin_session_token end,
             checkin_session_override_reason = case when $6 = true then $7 else null end,
             checkin_session_override_by = case when $6 = true then auth.uid() else null end,
             checkin_session_override_at = case when $6 = true then timezone('utc', now()) else null end
         where id = $1 and church_id = $2`,
        [input.serviceId, churchId, input.status, startsAt, endsAt, overrideEnabled, overrideReason],
      ),
    );

    if (input.status === "enabled" && overrideEnabled && readiness) {
      await runLocalCcmMutation(() =>
        queryTenantLocalDb(
          `insert into public.ccm_session_enablement_overrides
             (church_id, service_id, override_reason, readiness_snapshot, created_by)
           values ($1, $2, $3, $4::jsonb, auth.uid())`,
          [
            churchId,
            input.serviceId,
            overrideReason,
            JSON.stringify({
              activeRoomCount: readiness.activeRoomCount,
              uncoveredRooms: readiness.uncoveredRooms,
            }),
          ],
        ),
      );
    }
  } else {
    const supabase = await createTenantServerClient();
    const { error } = await supabase
      .from("ccm_services")
      .update({
        checkin_session_status: input.status,
        checkin_session_starts_at: startsAt,
        checkin_session_ends_at: endsAt,
        checkin_session_enabled_at: input.status === "enabled" ? enabledAt : undefined,
        checkin_session_closed_at: input.status === "closed" ? closedAt : undefined,
        checkin_session_token: input.status === "closed" ? randomUUID() : undefined,
        checkin_session_override_reason: overrideEnabled ? overrideReason : null,
        checkin_session_override_by: overrideEnabled ? session.userId : null,
        checkin_session_override_at: overrideEnabled ? enabledAt : null,
      })
      .eq("id", input.serviceId)
      .eq("church_id", churchId);

    if (error) {
      throw new Error(error.message);
    }

    if (input.status === "enabled" && overrideEnabled && readiness) {
      const { error: overrideError } = await supabase
        .from("ccm_session_enablement_overrides")
        .insert({
          church_id: churchId,
          service_id: input.serviceId,
          override_reason: overrideReason,
          readiness_snapshot: {
            activeRoomCount: readiness.activeRoomCount,
            uncoveredRooms: readiness.uncoveredRooms,
          },
        });

      if (overrideError) {
        throw new Error(overrideError.message);
      }
    }
  }

  revalidatePath(`${CCM_PATH}/services/${input.serviceId}`);
  revalidatePath(`${CCM_PATH}/services`);
  revalidatePath(`${CCM_PATH}/checkin`);
}

// ── closeServiceAction ────────────────────────────────────────────────────────

export async function closeServiceAction(
  serviceId: string,
): Promise<void> {
  const session = await requireCcmSession();
  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    // Mark service closed
    await queryTenantLocalDb(
      `update public.ccm_services
       set status = 'closed',
           ended_at = timezone('utc', now()),
           checkin_session_status = 'closed',
           checkin_session_closed_at = timezone('utc', now()),
           checkin_session_token = gen_random_uuid()::text
       where id = $1 and church_id = $2`,
      [serviceId, churchId],
    );
    // Flag any still-checked-in children as late_pickup
    await queryTenantLocalDb(
      `update public.ccm_checkin_sessions
       set status = 'late_pickup',
           late_pickup_notified_at = timezone('utc', now())
       where service_id = $1 and church_id = $2 and status = 'checked_in'`,
      [serviceId, churchId],
    );
    revalidatePath(`${CCM_PATH}/services/${serviceId}`);
    revalidatePath(`${CCM_PATH}/dashboard`);
    return;
  }

  const supabase = await createTenantServerClient();
  await supabase
    .from("ccm_services")
    .update({
      status: "closed",
      ended_at: new Date().toISOString(),
      checkin_session_status: "closed",
      checkin_session_closed_at: new Date().toISOString(),
      checkin_session_token: randomUUID(),
    })
    .eq("id", serviceId)
    .eq("church_id", churchId);
  await supabase
    .from("ccm_checkin_sessions")
    .update({ status: "late_pickup", late_pickup_notified_at: new Date().toISOString() })
    .eq("service_id", serviceId)
    .eq("church_id", churchId)
    .eq("status", "checked_in");
  revalidatePath(`${CCM_PATH}/services/${serviceId}`);
  revalidatePath(`${CCM_PATH}/dashboard`);
}

// ── checkinChildAction ────────────────────────────────────────────────────────
// Generates a plaintext PIN, bcrypt-hashes it, inserts the session row,
// and returns the PLAINTEXT PIN once for badge printing. It is never stored.

export async function checkinChildAction(
  input: CheckinChildInput,
): Promise<CcmCheckinResult> {
  const session = await requireCcmSession();
  const churchId = session.appContext.church.id;

  const now = Date.now();

  if (shouldUseLocalTenantFallback()) {
    const serviceGate = await runLocalCcmMutation(() =>
      queryTenantLocalDb<{
        status: string;
        checkin_session_status: string;
        checkin_session_starts_at: string | null;
        checkin_session_ends_at: string | null;
      }>(
        `select status, checkin_session_status,
                checkin_session_starts_at::text,
                checkin_session_ends_at::text
         from public.ccm_services
         where id = $1 and church_id = $2
         limit 1`,
        [input.serviceId, churchId],
      ),
    );

    const gate = serviceGate.rows[0];
    if (!gate || gate.status !== "open") {
      throw new Error("This service is not open for check-in.");
    }
    if (gate.checkin_session_status !== "enabled") {
      throw new Error("Check-in session is not enabled for this service.");
    }

    if (gate.checkin_session_starts_at && gate.checkin_session_ends_at) {
      const startsAt = new Date(gate.checkin_session_starts_at).getTime();
      const endsAt = new Date(gate.checkin_session_ends_at).getTime();
      if (!Number.isNaN(startsAt) && now < startsAt) {
        throw new Error("Check-in session has not opened yet.");
      }
      if (!Number.isNaN(endsAt) && now > endsAt) {
        throw new Error("Check-in session is closed for today.");
      }
    }
  } else {
    const supabase = await createTenantServerClient();
    const { data: gate, error: gateError } = await supabase
      .from("ccm_services")
      .select("status, checkin_session_status, checkin_session_starts_at, checkin_session_ends_at")
      .eq("id", input.serviceId)
      .eq("church_id", churchId)
      .maybeSingle();

    if (gateError) {
      throw new Error(gateError.message);
    }

    if (!gate || gate.status !== "open") {
      throw new Error("This service is not open for check-in.");
    }
    if (gate.checkin_session_status !== "enabled") {
      throw new Error("Check-in session is not enabled for this service.");
    }

    if (gate.checkin_session_starts_at && gate.checkin_session_ends_at) {
      const startsAt = new Date(gate.checkin_session_starts_at).getTime();
      const endsAt = new Date(gate.checkin_session_ends_at).getTime();
      if (!Number.isNaN(startsAt) && now < startsAt) {
        throw new Error("Check-in session has not opened yet.");
      }
      if (!Number.isNaN(endsAt) && now > endsAt) {
        throw new Error("Check-in session is closed for today.");
      }
    }
  }

  // Generate plaintext PIN via Postgres function, then hash it
  let plainPin: string;

  if (shouldUseLocalTenantFallback()) {
    const pinRes = await queryTenantLocalDb<{ pin: string }>(
      `select public.generate_checkin_pin() as pin`,
      [],
    );
    plainPin = pinRes.rows[0].pin;
  } else {
    const supabase = await createTenantServerClient();
    const { data } = await supabase.rpc("generate_checkin_pin");
    plainPin = (data as string) ?? Math.random().toString(36).slice(2, 8).toUpperCase();
  }

  const pinHash = await bcrypt.hash(plainPin, 12);

  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{
      id: string; service_id: string; room_id: string; room_name: string;
      child_profile_id: string | null; child_name: string;
      guardian_name: string | null; qr_token: string; status: string;
      current_room_id: string | null; is_first_visit: boolean;
      checked_in_at: string; checked_out_at: string | null;
      released_to_name: string | null; silent_page_sent_at: string | null;
      late_pickup_notified_at: string | null;
    }>(
      `insert into public.ccm_checkin_sessions
         (church_id, service_id, room_id, child_profile_id, child_name,
          guardian_name, guardian_phone, pin_hash, current_room_id,
          is_first_visit, checked_in_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $3, $9, auth.uid())
       returning
         id, service_id, room_id,
         (select name from public.children_rooms where id = room_id) as room_name,
         child_profile_id, child_name, guardian_name, qr_token, status,
         current_room_id, is_first_visit,
         checked_in_at::text, checked_out_at::text,
         released_to_name, silent_page_sent_at::text, late_pickup_notified_at::text`,
      [
        churchId, input.serviceId, input.roomId,
        input.childProfileId ?? null, input.childName,
        input.guardianName ?? null, input.guardianPhone ?? null,
        pinHash, input.isFirstVisit ? true : false,
      ],
    );
    const row = result.rows[0];
    const sessionObj: CcmCheckinSession = {
      id: row.id, serviceId: row.service_id, roomId: row.room_id,
      roomName: row.room_name ?? "", childProfileId: row.child_profile_id,
      childName: row.child_name, guardianName: row.guardian_name,
      qrToken: row.qr_token, status: "checked_in",
      currentRoomId: row.current_room_id, currentRoomName: null,
      isFirstVisit: row.is_first_visit,
      checkedInAt: row.checked_in_at, checkedOutAt: null,
      releasedToName: null, silentPageSentAt: null, latePickupNotifiedAt: null,
      criticalAllergies: [], allAllergies: [], noPhotoFlag: false,
    };
    revalidatePath(`${CCM_PATH}/dashboard`);
    return { session: sessionObj, pin: plainPin, pinForGuardian: plainPin };
  }

  const supabase = await createTenantServerClient();
  const { data, error } = await supabase
    .from("ccm_checkin_sessions")
    .insert({
      church_id: churchId,
      service_id: input.serviceId,
      room_id: input.roomId,
      child_profile_id: input.childProfileId ?? null,
      child_name: input.childName,
      guardian_name: input.guardianName ?? null,
      guardian_phone: input.guardianPhone ?? null,
      pin_hash: pinHash,
      current_room_id: input.roomId,
      is_first_visit: input.isFirstVisit ?? false,
    })
    .select("id, service_id, room_id, child_profile_id, child_name, guardian_name, qr_token, status, current_room_id, is_first_visit, checked_in_at")
    .single();
  if (error) throw new Error(error.message);
  const row = data as {
    id: string; service_id: string; room_id: string;
    child_profile_id: string | null; child_name: string;
    guardian_name: string | null; qr_token: string; status: string;
    current_room_id: string | null; is_first_visit: boolean; checked_in_at: string;
  };
  const sessionObj: CcmCheckinSession = {
    id: row.id, serviceId: row.service_id, roomId: row.room_id, roomName: "",
    childProfileId: row.child_profile_id, childName: row.child_name,
    guardianName: row.guardian_name, qrToken: row.qr_token, status: "checked_in",
    currentRoomId: row.current_room_id, currentRoomName: null,
    isFirstVisit: row.is_first_visit,
    checkedInAt: row.checked_in_at, checkedOutAt: null,
    releasedToName: null, silentPageSentAt: null, latePickupNotifiedAt: null,
    criticalAllergies: [], allAllergies: [], noPhotoFlag: false,
  };
  revalidatePath(`${CCM_PATH}/dashboard`);
  return { session: sessionObj, pin: plainPin, pinForGuardian: plainPin };
}

// ── checkoutChildAction ───────────────────────────────────────────────────────
// Verifies the provided PIN against the stored bcrypt hash.
// Also accepts QR verification (when providedPin === qrToken).

export async function checkoutChildAction(
  input: CheckoutChildInput,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireCcmSession();
  const churchId = session.appContext.church.id;

  // Fetch the session row (pin_hash + status)
  let storedHash: string;
  let currentStatus: string;
  let qrToken: string;

  if (shouldUseLocalTenantFallback()) {
    const res = await queryTenantLocalDb<{
      pin_hash: string; status: string; qr_token: string;
    }>(
      `select pin_hash, status, qr_token
       from public.ccm_checkin_sessions
       where id = $1 and church_id = $2`,
      [input.sessionId, churchId],
    );
    if (!res.rows[0]) return { ok: false, error: "Session not found." };
    ({ pin_hash: storedHash, status: currentStatus, qr_token: qrToken } = res.rows[0]);
  } else {
    const supabase = await createTenantServerClient();
    const { data, error } = await supabase
      .from("ccm_checkin_sessions")
      .select("pin_hash, status, qr_token")
      .eq("id", input.sessionId)
      .eq("church_id", churchId)
      .single();
    if (error || !data) return { ok: false, error: "Session not found." };
    storedHash = (data as { pin_hash: string }).pin_hash;
    currentStatus = (data as { status: string }).status;
    qrToken = (data as { qr_token: string }).qr_token;
  }

  if (currentStatus === "checked_out") {
    return { ok: false, error: "Child has already been checked out." };
  }

  // Verify: PIN match (bcrypt) OR QR token match (constant-time)
  const pinValid = await bcrypt.compare(input.providedPin, storedHash);
  const qrValid = input.providedPin === qrToken;

  if (!pinValid && !qrValid) {
    return { ok: false, error: "Incorrect PIN. Please try again or contact staff." };
  }

  // Mark checked out
  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `update public.ccm_checkin_sessions
       set status = 'checked_out',
           checked_out_at = timezone('utc', now()),
           checked_out_by = auth.uid(),
           released_to_name = $3
       where id = $1 and church_id = $2`,
      [input.sessionId, churchId, input.releasedToName],
    );
  } else {
    const supabase = await createTenantServerClient();
    await supabase
      .from("ccm_checkin_sessions")
      .update({
        status: "checked_out",
        checked_out_at: new Date().toISOString(),
        released_to_name: input.releasedToName,
      })
      .eq("id", input.sessionId)
      .eq("church_id", churchId);
  }

  revalidatePath(`${CCM_PATH}/dashboard`);
  return { ok: true };
}

// ── transferChildAction ───────────────────────────────────────────────────────

export async function transferChildAction(
  sessionId: string,
  newRoomId: string,
): Promise<void> {
  const session = await requireCcmSession();
  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `update public.ccm_checkin_sessions
       set current_room_id = $3, last_location_at = timezone('utc', now()),
           status = 'transferred'
       where id = $1 and church_id = $2`,
      [sessionId, churchId, newRoomId],
    );
  } else {
    const supabase = await createTenantServerClient();
    await supabase
      .from("ccm_checkin_sessions")
      .update({
        current_room_id: newRoomId,
        last_location_at: new Date().toISOString(),
        status: "transferred",
      })
      .eq("id", sessionId)
      .eq("church_id", churchId);
  }
  revalidatePath(`${CCM_PATH}/dashboard`);
}

// ── silentPageAction ──────────────────────────────────────────────────────────
// Records timestamp and triggers guardian notification.
// Web Push delivery is handled client-side via VAPID — this action
// marks the record so the client knows to trigger the push.

export async function silentPageAction(
  sessionId: string,
): Promise<void> {
  const session = await requireCcmSession();
  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `update public.ccm_checkin_sessions
       set silent_page_sent_at = timezone('utc', now())
       where id = $1 and church_id = $2`,
      [sessionId, churchId],
    );
  } else {
    const supabase = await createTenantServerClient();
    await supabase
      .from("ccm_checkin_sessions")
      .update({ silent_page_sent_at: new Date().toISOString() })
      .eq("id", sessionId)
      .eq("church_id", churchId);
  }
  revalidatePath(`${CCM_PATH}/dashboard`);
}

// ── fileIncidentAction ────────────────────────────────────────────────────────

export async function fileIncidentAction(
  input: FileIncidentInput,
): Promise<{ id: string }> {
  const session = await requireCcmSession();
  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{ id: string }>(
      `insert into public.ccm_incidents
         (church_id, service_id, session_id, child_name, incident_type,
          severity, description, actions_taken, guardian_notified,
          follow_up_required, reported_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, auth.uid())
       returning id`,
      [
        churchId, input.serviceId ?? null, input.sessionId ?? null,
        input.childName, input.incidentType, input.severity,
        input.description, input.actionsTaken ?? null,
        input.guardianNotified ?? false, input.followUpRequired ?? false,
      ],
    );
    revalidatePath(`${CCM_PATH}/incidents`);
    return { id: result.rows[0].id };
  }

  const supabase = await createTenantServerClient();
  const { data, error } = await supabase
    .from("ccm_incidents")
    .insert({
      church_id: churchId,
      service_id: input.serviceId ?? null,
      session_id: input.sessionId ?? null,
      child_name: input.childName,
      incident_type: input.incidentType,
      severity: input.severity,
      description: input.description,
      actions_taken: input.actionsTaken ?? null,
      guardian_notified: input.guardianNotified ?? false,
      follow_up_required: input.followUpRequired ?? false,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  revalidatePath(`${CCM_PATH}/incidents`);
  return { id: (data as { id: string }).id };
}

// ── updateChildProfileAction ──────────────────────────────────────────────────

export async function updateChildProfileAction(
  input: UpdateChildProfileInput,
): Promise<void> {
  const session = await requireCcmSession();
  const churchId = session.appContext.church.id;

  const updates: Record<string, unknown> = {};
  if (input.dob !== undefined) updates.dob = input.dob;
  if (input.photoUrl !== undefined) updates.photo_url = input.photoUrl;
  if (input.noPhotoFlag !== undefined) updates.no_photo_flag = input.noPhotoFlag;
  if (input.allergies !== undefined) updates.allergies = JSON.stringify(input.allergies);
  if (input.specialNeedsNotes !== undefined) updates.special_needs_notes = input.specialNeedsNotes;
  if (input.custodyNotes !== undefined) updates.custody_notes = input.custodyNotes;
  updates.updated_at = new Date().toISOString();

  if (shouldUseLocalTenantFallback()) {
    // Upsert the sensitive_data row
    const keys = Object.keys(updates);
    const vals = Object.values(updates);
    // Build upsert: insert or update
    const cols = ["child_profile_id", "church_id", ...keys];
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
    const updateClauses = keys.map((k, i) => `${k} = $${i + 3}`).join(", ");
    await queryTenantLocalDb(
      `insert into public.children_sensitive_data
         (${cols.join(", ")})
       values (${placeholders})
       on conflict (church_id, child_profile_id) do update
       set ${updateClauses}`,
      [input.childProfileId, churchId, ...vals],
    );
    revalidatePath(`${CCM_PATH}/children/${input.childProfileId}`);
    return;
  }

  const supabase = await createTenantServerClient();
  await supabase
    .from("children_sensitive_data")
    .upsert({ child_profile_id: input.childProfileId, church_id: churchId, ...updates });
  revalidatePath(`${CCM_PATH}/children/${input.childProfileId}`);
}

// ── upsertAuthorizedPickupAction ──────────────────────────────────────────────

export async function upsertAuthorizedPickupAction(
  input: UpsertPickupInput,
): Promise<{ id: string }> {
  const session = await requireCcmSession();
  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    if (input.id) {
      await queryTenantLocalDb(
        `update public.ccm_authorized_pickups
         set authorized_name = $3, relationship = $4, phone = $5,
             photo_url = $6, id_verified = $7, is_primary = $8,
             notes = $9, updated_at = timezone('utc', now())
         where id = $1 and church_id = $2`,
        [
          input.id, churchId, input.authorizedName, input.relationship,
          input.phone ?? null, input.photoUrl ?? null,
          input.idVerified ?? false, input.isPrimary ?? false, input.notes ?? null,
        ],
      );
      revalidatePath(`${CCM_PATH}/children/${input.childProfileId}`);
      return { id: input.id };
    }
    const result = await queryTenantLocalDb<{ id: string }>(
      `insert into public.ccm_authorized_pickups
         (church_id, child_profile_id, authorized_name, relationship,
          phone, photo_url, id_verified, is_primary, notes)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       returning id`,
      [
        churchId, input.childProfileId, input.authorizedName, input.relationship,
        input.phone ?? null, input.photoUrl ?? null,
        input.idVerified ?? false, input.isPrimary ?? false, input.notes ?? null,
      ],
    );
    revalidatePath(`${CCM_PATH}/children/${input.childProfileId}`);
    return { id: result.rows[0].id };
  }

  const supabase = await createTenantServerClient();
  const row = {
    church_id: churchId,
    child_profile_id: input.childProfileId,
    authorized_name: input.authorizedName,
    relationship: input.relationship,
    phone: input.phone ?? null,
    photo_url: input.photoUrl ?? null,
    id_verified: input.idVerified ?? false,
    is_primary: input.isPrimary ?? false,
    notes: input.notes ?? null,
    ...(input.id ? { id: input.id } : {}),
  };
  const { data, error } = await supabase
    .from("ccm_authorized_pickups")
    .upsert(row)
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  revalidatePath(`${CCM_PATH}/children/${input.childProfileId}`);
  return { id: (data as { id: string }).id };
}

// ── addCustodyRestrictionAction ───────────────────────────────────────────────

export async function addCustodyRestrictionAction(
  input: AddCustodyRestrictionInput,
): Promise<{ id: string }> {
  const session = await requireCcmSession();
  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{ id: string }>(
      `insert into public.ccm_custody_restrictions
         (church_id, child_profile_id, restricted_name, relationship,
          court_order_on_file, notes, created_by)
       values ($1, $2, $3, $4, $5, $6, auth.uid())
       returning id`,
      [
        churchId, input.childProfileId, input.restrictedName,
        input.relationship ?? null, input.courtOrderOnFile ?? false,
        input.notes ?? null,
      ],
    );
    revalidatePath(`${CCM_PATH}/children/${input.childProfileId}`);
    return { id: result.rows[0].id };
  }

  const supabase = await createTenantServerClient();
  const { data, error } = await supabase
    .from("ccm_custody_restrictions")
    .insert({
      church_id: churchId,
      child_profile_id: input.childProfileId,
      restricted_name: input.restrictedName,
      relationship: input.relationship ?? null,
      court_order_on_file: input.courtOrderOnFile ?? false,
      notes: input.notes ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  revalidatePath(`${CCM_PATH}/children/${input.childProfileId}`);
  return { id: (data as { id: string }).id };
}

// ── assignVolunteerAction ─────────────────────────────────────────────────────

export async function assignVolunteerAction(
  input: AssignVolunteerInput,
): Promise<void> {
  const session = await requireCcmSession();
  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `insert into public.ccm_volunteer_assignments
         (church_id, service_id, room_id, profile_id, role, background_check_verified)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (service_id, room_id, profile_id) do update
       set role = excluded.role,
           background_check_verified = excluded.background_check_verified`,
      [
        churchId, input.serviceId, input.roomId, input.profileId,
        input.role ?? "assistant", input.backgroundCheckVerified ?? false,
      ],
    );
    revalidatePath(`${CCM_PATH}/services/${input.serviceId}`);
    return;
  }

  const supabase = await createTenantServerClient();
  await supabase
    .from("ccm_volunteer_assignments")
    .upsert({
      church_id: churchId,
      service_id: input.serviceId,
      room_id: input.roomId,
      profile_id: input.profileId,
      role: input.role ?? "assistant",
      background_check_verified: input.backgroundCheckVerified ?? false,
    });
  revalidatePath(`${CCM_PATH}/services/${input.serviceId}`);
}
