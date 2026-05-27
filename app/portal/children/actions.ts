"use server";

import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
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

function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ");
}

function namesMatch(left: string, right: string) {
  return normalizeName(left) === normalizeName(right);
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function requestFingerprintHash() {
  const headerStore = await headers();
  const forwardedFor = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const userAgent = headerStore.get("user-agent") ?? "unknown";
  return sha256(`${forwardedFor}:${userAgent}`);
}

async function getRecentFailureCount(
  context: { churchId: string; serviceId: string; tokenHash: string },
  fingerprintHash: string,
  mode: "checkin" | "checkout",
) {
  const windowMinutes = 10;

  if (shouldUseLocalTenantFallback() || !hasTenantBackendEnv()) {
    const result = await queryTenantLocalDb<{ attempts: number }>(
      `select count(*)::int as attempts
       from public.ccm_public_session_attempts
       where church_id = $1
         and service_id = $2
         and attempt_type = $3
         and session_token_hash = $4
         and fingerprint_hash = $5
         and success = false
         and created_at >= timezone('utc', now()) - ($6::text || ' minutes')::interval`,
      [
        context.churchId,
        context.serviceId,
        mode,
        context.tokenHash,
        fingerprintHash,
        String(windowMinutes),
      ],
    );

    return result.rows[0]?.attempts ?? 0;
  }

  if (!hasTenantAdminBackendEnv()) {
    return 0;
  }

  const supabase = createTenantAdminClient();
  const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("ccm_public_session_attempts")
    .select("id", { count: "exact", head: true })
    .eq("church_id", context.churchId)
    .eq("service_id", context.serviceId)
    .eq("attempt_type", mode)
    .eq("session_token_hash", context.tokenHash)
    .eq("fingerprint_hash", fingerprintHash)
    .eq("success", false)
    .gte("created_at", since);

  return count ?? 0;
}

async function recordSessionAttempt(
  context: { churchId: string; serviceId: string; tokenHash: string },
  fingerprintHash: string,
  mode: "checkin" | "checkout",
  success: boolean,
) {
  if (shouldUseLocalTenantFallback() || !hasTenantBackendEnv()) {
    await queryTenantLocalDb(
      `insert into public.ccm_public_session_attempts
         (church_id, service_id, attempt_type, session_token_hash, fingerprint_hash, success)
       values ($1, $2, $3, $4, $5, $6)`,
      [context.churchId, context.serviceId, mode, context.tokenHash, fingerprintHash, success],
    );
    return;
  }

  if (!hasTenantAdminBackendEnv()) {
    return;
  }

  const supabase = createTenantAdminClient();
  await supabase.from("ccm_public_session_attempts").insert({
    church_id: context.churchId,
    service_id: context.serviceId,
    attempt_type: mode,
    session_token_hash: context.tokenHash,
    fingerprint_hash: fingerprintHash,
    success,
  });
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

  const tokenHash = sha256(token);
  const fingerprintHash = await requestFingerprintHash();
  const failures = await getRecentFailureCount(
    { churchId: record.churchId, serviceId: record.serviceId, tokenHash },
    fingerprintHash,
    "checkin",
  );

  if (failures >= 5) {
    return {
      ok: false,
      error: "Too many failed attempts. Please wait a few minutes before trying again.",
    };
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
      await recordSessionAttempt(
        { churchId: record.churchId, serviceId: record.serviceId, tokenHash },
        fingerprintHash,
        "checkin",
        false,
      );
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

    await recordSessionAttempt(
      { churchId: record.churchId, serviceId: record.serviceId, tokenHash },
      fingerprintHash,
      "checkin",
      true,
    );

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
    await recordSessionAttempt(
      { churchId: record.churchId, serviceId: record.serviceId, tokenHash },
      fingerprintHash,
      "checkin",
      false,
    );
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
    await recordSessionAttempt(
      { churchId: record.churchId, serviceId: record.serviceId, tokenHash },
      fingerprintHash,
      "checkin",
      false,
    );
    return { ok: false, error: insertError.message };
  }

  revalidatePath(routePath("checkin", token));
  revalidatePath(routePath("checkout", token));

  await recordSessionAttempt(
    { churchId: record.churchId, serviceId: record.serviceId, tokenHash },
    fingerprintHash,
    "checkin",
    true,
  );

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

  const tokenHash = sha256(token);
  const fingerprintHash = await requestFingerprintHash();
  const failures = await getRecentFailureCount(
    { churchId: record.churchId, serviceId: record.serviceId, tokenHash },
    fingerprintHash,
    "checkout",
  );

  if (failures >= 5) {
    return {
      ok: false,
      error: "Too many failed attempts. Please wait a few minutes before trying again.",
    };
  }

  if (shouldUseLocalTenantFallback() || !hasTenantBackendEnv()) {
    const sessionResult = await queryTenantLocalDb<{
      child_name: string;
      child_profile_id: string | null;
      status: string;
      pin_hash: string;
      qr_token: string;
    }>(
      `select child_name, child_profile_id, status, pin_hash, qr_token
       from public.ccm_checkin_sessions
       where id = $1 and church_id = $2 and service_id = $3
       limit 1`,
      [sessionId, record.churchId, record.serviceId],
    );

    const session = sessionResult.rows[0];
    if (!session) {
      await recordSessionAttempt(
        { churchId: record.churchId, serviceId: record.serviceId, tokenHash },
        fingerprintHash,
        "checkout",
        false,
      );
      return { ok: false, error: "Child session could not be found." };
    }

    if (session.status === "checked_out") {
      await recordSessionAttempt(
        { churchId: record.churchId, serviceId: record.serviceId, tokenHash },
        fingerprintHash,
        "checkout",
        false,
      );
      return { ok: false, error: "This child has already been checked out." };
    }

    if (session.child_profile_id) {
      const restrictionsResult = await queryTenantLocalDb<{ restricted_name: string }>(
        `select restricted_name
         from public.ccm_custody_restrictions
         where church_id = $1 and child_profile_id = $2`,
        [record.churchId, session.child_profile_id],
      );

      if (
        restrictionsResult.rows.some((row) => namesMatch(row.restricted_name, releasedToName))
      ) {
        await recordSessionAttempt(
          { churchId: record.churchId, serviceId: record.serviceId, tokenHash },
          fingerprintHash,
          "checkout",
          false,
        );
        return {
          ok: false,
          error: "This release person is restricted from pickup. Please contact staff immediately.",
        };
      }

      const pickupsResult = await queryTenantLocalDb<{ authorized_name: string }>(
        `select authorized_name
         from public.ccm_authorized_pickups
         where church_id = $1 and child_profile_id = $2`,
        [record.churchId, session.child_profile_id],
      );

      if (
        pickupsResult.rows.length > 0 &&
        !pickupsResult.rows.some((row) => namesMatch(row.authorized_name, releasedToName))
      ) {
        await recordSessionAttempt(
          { churchId: record.churchId, serviceId: record.serviceId, tokenHash },
          fingerprintHash,
          "checkout",
          false,
        );
        return {
          ok: false,
          error: "Release name is not on the authorized pickup list. Please contact staff.",
        };
      }
    }

    const pinValid = await bcrypt.compare(providedPin, session.pin_hash);
    const qrValid = providedPin === session.qr_token;

    if (!pinValid && !qrValid) {
      await recordSessionAttempt(
        { churchId: record.churchId, serviceId: record.serviceId, tokenHash },
        fingerprintHash,
        "checkout",
        false,
      );
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

    await recordSessionAttempt(
      { churchId: record.churchId, serviceId: record.serviceId, tokenHash },
      fingerprintHash,
      "checkout",
      true,
    );

    return { ok: true, childName: session.child_name };
  }

  if (!hasTenantAdminBackendEnv()) {
    return { ok: false, error: "Children session checkout is unavailable right now." };
  }

  const supabase = createTenantAdminClient();
  const { data: session, error: sessionError } = await supabase
    .from("ccm_checkin_sessions")
    .select("child_name, child_profile_id, status, pin_hash, qr_token")
    .eq("id", sessionId)
    .eq("church_id", record.churchId)
    .eq("service_id", record.serviceId)
    .maybeSingle();

  if (sessionError || !session) {
    await recordSessionAttempt(
      { churchId: record.churchId, serviceId: record.serviceId, tokenHash },
      fingerprintHash,
      "checkout",
      false,
    );
    return { ok: false, error: "Child session could not be found." };
  }

  if (session.status === "checked_out") {
    await recordSessionAttempt(
      { churchId: record.churchId, serviceId: record.serviceId, tokenHash },
      fingerprintHash,
      "checkout",
      false,
    );
    return { ok: false, error: "This child has already been checked out." };
  }

  if (session.child_profile_id) {
    const { data: restrictions } = await supabase
      .from("ccm_custody_restrictions")
      .select("restricted_name")
      .eq("church_id", record.churchId)
      .eq("child_profile_id", String(session.child_profile_id));

    if (
      (restrictions ?? []).some((row) => namesMatch(String(row.restricted_name), releasedToName))
    ) {
      await recordSessionAttempt(
        { churchId: record.churchId, serviceId: record.serviceId, tokenHash },
        fingerprintHash,
        "checkout",
        false,
      );
      return {
        ok: false,
        error: "This release person is restricted from pickup. Please contact staff immediately.",
      };
    }

    const { data: pickups } = await supabase
      .from("ccm_authorized_pickups")
      .select("authorized_name")
      .eq("church_id", record.churchId)
      .eq("child_profile_id", String(session.child_profile_id));

    if (
      (pickups ?? []).length > 0 &&
      !(pickups ?? []).some((row) => namesMatch(String(row.authorized_name), releasedToName))
    ) {
      await recordSessionAttempt(
        { churchId: record.churchId, serviceId: record.serviceId, tokenHash },
        fingerprintHash,
        "checkout",
        false,
      );
      return {
        ok: false,
        error: "Release name is not on the authorized pickup list. Please contact staff.",
      };
    }
  }

  const pinValid = await bcrypt.compare(providedPin, String(session.pin_hash));
  const qrValid = providedPin === String(session.qr_token);

  if (!pinValid && !qrValid) {
    await recordSessionAttempt(
      { churchId: record.churchId, serviceId: record.serviceId, tokenHash },
      fingerprintHash,
      "checkout",
      false,
    );
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
    await recordSessionAttempt(
      { churchId: record.churchId, serviceId: record.serviceId, tokenHash },
      fingerprintHash,
      "checkout",
      false,
    );
    return { ok: false, error: updateError.message };
  }

  revalidatePath(routePath("checkin", token));
  revalidatePath(routePath("checkout", token));

  await recordSessionAttempt(
    { churchId: record.churchId, serviceId: record.serviceId, tokenHash },
    fingerprintHash,
    "checkout",
    true,
  );

  return { ok: true, childName: String(session.child_name) };
}
