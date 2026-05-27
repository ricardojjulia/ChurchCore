"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";

import {
  evaluatePublicCcmSessionAvailability,
  getPublicCcmSessionByToken,
} from "@/lib/ccm-public-data";
import {
  createTenantAdminClient,
  hasTenantAdminBackendEnv,
  hasTenantBackendEnv,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";
import { hasTenantDbUrl } from "@/lib/supabase/config";

export type PublicChildCheckinInput = {
  token: string;
  roomId: string;
  childName: string;
  guardianName?: string;
  guardianPhone?: string;
  isFirstVisit?: boolean;
};

export type PublicChildCheckinResult =
  | { ok: true; pin: string; childName: string }
  | { ok: false; error: string };

export type PublicChildCheckoutInput = {
  token: string;
  sessionId: string;
  providedPin: string;
  releasedToName: string;
};

export type PublicChildCheckoutResult =
  | { ok: true; childName: string }
  | { ok: false; error: string };

function routePath(mode: "checkin" | "checkout", token: string) {
  return `/portal/children/${mode}/${encodeURIComponent(token)}`;
}

async function resolveAvailableSession(token: string, mode: "checkin" | "checkout") {
  const record = await getPublicCcmSessionByToken(token);
  const availability = evaluatePublicCcmSessionAvailability(record, mode);

  if (!record || availability.state !== "available") {
    return {
      record,
      error: availability.detail,
    };
  }

  return { record, error: null as string | null };
}

export async function submitPublicChildCheckinAction(
  input: PublicChildCheckinInput,
): Promise<PublicChildCheckinResult> {
  if (!hasTenantBackendEnv() && !hasTenantDbUrl()) {
    return { ok: false, error: "Children session check-in is unavailable in preview mode." };
  }

  const token = input.token.trim();
  const roomId = input.roomId.trim();
  const childName = input.childName.trim();

  if (!token || !roomId || !childName) {
    return { ok: false, error: "Child name and room are required." };
  }

  const { record, error } = await resolveAvailableSession(token, "checkin");
  if (!record || error) {
    return { ok: false, error: error ?? "Children session is unavailable." };
  }

  if (shouldUseLocalTenantFallback() || !hasTenantBackendEnv()) {
    const roomResult = await queryTenantLocalDb<{ id: string }>(
      `select id
       from public.children_rooms
       where id = $1 and church_id = $2 and ministry_id = $3 and is_active = true
       limit 1`,
      [roomId, record.churchId, record.ministryId],
    );

    if (!roomResult.rows[0]) {
      return { ok: false, error: "Selected room is not available for this session." };
    }

    const pinResult = await queryTenantLocalDb<{ pin: string }>(
      `select public.generate_checkin_pin() as pin`,
      [],
    );
    const pin = pinResult.rows[0]?.pin ?? Math.random().toString(36).slice(2, 8).toUpperCase();
    const pinHash = await bcrypt.hash(pin, 12);

    await queryTenantLocalDb(
      `insert into public.ccm_checkin_sessions
         (church_id, service_id, room_id, child_name, guardian_name, guardian_phone,
          pin_hash, current_room_id, is_first_visit)
       values ($1, $2, $3, $4, $5, $6, $7, $3, $8)`,
      [
        record.churchId,
        record.serviceId,
        roomId,
        childName,
        input.guardianName?.trim() || null,
        input.guardianPhone?.trim() || null,
        pinHash,
        input.isFirstVisit === true,
      ],
    );

    revalidatePath(routePath("checkin", token));
    revalidatePath(routePath("checkout", token));

    return { ok: true, pin, childName };
  }

  if (!hasTenantAdminBackendEnv()) {
    return { ok: false, error: "Children session check-in is unavailable right now." };
  }

  const supabase = createTenantAdminClient();
  const { data: roomData, error: roomError } = await supabase
    .from("children_rooms")
    .select("id")
    .eq("id", roomId)
    .eq("church_id", record.churchId)
    .eq("ministry_id", record.ministryId)
    .eq("is_active", true)
    .maybeSingle();

  if (roomError || !roomData) {
    return { ok: false, error: "Selected room is not available for this session." };
  }

  const { data: pinData } = await supabase.rpc("generate_checkin_pin");
  const pin = (pinData as string | null) ?? Math.random().toString(36).slice(2, 8).toUpperCase();
  const pinHash = await bcrypt.hash(pin, 12);

  const { error: insertError } = await supabase.from("ccm_checkin_sessions").insert({
    church_id: record.churchId,
    service_id: record.serviceId,
    room_id: roomId,
    child_name: childName,
    guardian_name: input.guardianName?.trim() || null,
    guardian_phone: input.guardianPhone?.trim() || null,
    pin_hash: pinHash,
    current_room_id: roomId,
    is_first_visit: input.isFirstVisit === true,
  });

  if (insertError) {
    return { ok: false, error: insertError.message };
  }

  revalidatePath(routePath("checkin", token));
  revalidatePath(routePath("checkout", token));

  return { ok: true, pin, childName };
}

export async function submitPublicChildCheckoutAction(
  input: PublicChildCheckoutInput,
): Promise<PublicChildCheckoutResult> {
  if (!hasTenantBackendEnv() && !hasTenantDbUrl()) {
    return { ok: false, error: "Children session checkout is unavailable in preview mode." };
  }

  const token = input.token.trim();
  const sessionId = input.sessionId.trim();
  const providedPin = input.providedPin.trim();
  const releasedToName = input.releasedToName.trim();

  if (!token || !sessionId || !providedPin || !releasedToName) {
    return { ok: false, error: "Checkout requires child, PIN, and release name." };
  }

  const { record, error } = await resolveAvailableSession(token, "checkout");
  if (!record || error) {
    return { ok: false, error: error ?? "Children session is unavailable." };
  }

  if (shouldUseLocalTenantFallback() || !hasTenantBackendEnv()) {
    const sessionResult = await queryTenantLocalDb<{
      child_name: string;
      status: string;
      pin_hash: string;
      qr_token: string;
    }>(
      `select child_name, status, pin_hash, qr_token
       from public.ccm_checkin_sessions
       where id = $1 and church_id = $2 and service_id = $3
       limit 1`,
      [sessionId, record.churchId, record.serviceId],
    );

    const session = sessionResult.rows[0];
    if (!session) {
      return { ok: false, error: "Child session could not be found." };
    }

    if (session.status === "checked_out") {
      return { ok: false, error: "This child has already been checked out." };
    }

    const pinValid = await bcrypt.compare(providedPin, session.pin_hash);
    const qrValid = providedPin === session.qr_token;

    if (!pinValid && !qrValid) {
      return { ok: false, error: "Incorrect PIN or claim token." };
    }

    await queryTenantLocalDb(
      `update public.ccm_checkin_sessions
       set status = 'checked_out',
           checked_out_at = timezone('utc', now()),
           released_to_name = $4
       where id = $1 and church_id = $2 and service_id = $3`,
      [sessionId, record.churchId, record.serviceId, releasedToName],
    );

    revalidatePath(routePath("checkin", token));
    revalidatePath(routePath("checkout", token));

    return { ok: true, childName: session.child_name };
  }

  if (!hasTenantAdminBackendEnv()) {
    return { ok: false, error: "Children session checkout is unavailable right now." };
  }

  const supabase = createTenantAdminClient();
  const { data: session, error: sessionError } = await supabase
    .from("ccm_checkin_sessions")
    .select("child_name, status, pin_hash, qr_token")
    .eq("id", sessionId)
    .eq("church_id", record.churchId)
    .eq("service_id", record.serviceId)
    .maybeSingle();

  if (sessionError || !session) {
    return { ok: false, error: "Child session could not be found." };
  }

  if (session.status === "checked_out") {
    return { ok: false, error: "This child has already been checked out." };
  }

  const pinValid = await bcrypt.compare(providedPin, String(session.pin_hash));
  const qrValid = providedPin === String(session.qr_token);

  if (!pinValid && !qrValid) {
    return { ok: false, error: "Incorrect PIN or claim token." };
  }

  const { error: updateError } = await supabase
    .from("ccm_checkin_sessions")
    .update({
      status: "checked_out",
      checked_out_at: new Date().toISOString(),
      released_to_name: releasedToName,
    })
    .eq("id", sessionId)
    .eq("church_id", record.churchId)
    .eq("service_id", record.serviceId);

  if (updateError) {
    return { ok: false, error: updateError.message };
  }

  revalidatePath(routePath("checkin", token));
  revalidatePath(routePath("checkout", token));

  return { ok: true, childName: String(session.child_name) };
}
