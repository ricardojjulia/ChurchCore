import "server-only";

// Shared children's check-in (G2.2). The staff screen (checkinChildAction) and
// the family kiosk both create check-ins here, so a kiosk check-in is the same
// record, with the same bcrypt-hashed badge PIN, as a staff one.
//
// server-only, not "use server": performCheckin trusts the church id and actor
// it is handed. Callers authenticate first (a church-admin session, or a kiosk
// session) and pass values taken from that session, never from the browser.

import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";

import type { CcmCheckinSession } from "@/lib/ccm-types";
import { createTenantAdminClient } from "@/lib/supabase/tenant";

export type CheckinSource = "staff" | "kiosk";

export type ServiceGateReason = "not_open" | "not_enabled" | "not_started" | "ended";

export type ServiceGateRow = {
  ministry_id: string;
  status: string;
  checkin_session_status: string;
  checkin_session_starts_at: string | null;
  checkin_session_ends_at: string | null;
};

/** Why check-in is closed for this service right now, or null when it is open. */
export function evaluateServiceGate(
  gate: Pick<
    ServiceGateRow,
    "status" | "checkin_session_status" | "checkin_session_starts_at" | "checkin_session_ends_at"
  >,
  now: number = Date.now(),
): ServiceGateReason | null {
  if (gate.status !== "open") return "not_open";
  if (gate.checkin_session_status !== "enabled") return "not_enabled";
  if (gate.checkin_session_starts_at && gate.checkin_session_ends_at) {
    const startsAt = new Date(gate.checkin_session_starts_at).getTime();
    const endsAt = new Date(gate.checkin_session_ends_at).getTime();
    if (!Number.isNaN(startsAt) && now < startsAt) return "not_started";
    if (!Number.isNaN(endsAt) && now > endsAt) return "ended";
  }
  return null;
}

export const SERVICE_GATE_MESSAGES: Record<ServiceGateReason, string> = {
  not_open: "This service is not open for check-in.",
  not_enabled: "Check-in session is not enabled for this service.",
  not_started: "Check-in session has not opened yet.",
  ended: "Check-in session is closed for today.",
};

const PIN_ALPHABET = "ACEFGHJKLMNPQRTUVWXY3479";
const PIN_LENGTH = 6;
const PIN_BCRYPT_COST = 12;

function randomPin(): string {
  let pin = "";
  for (let i = 0; i < PIN_LENGTH; i += 1) {
    pin += PIN_ALPHABET[randomInt(PIN_ALPHABET.length)];
  }
  return pin;
}

async function generatePin(admin: ReturnType<typeof createTenantAdminClient>): Promise<string> {
  const { data, error } = await admin.rpc("generate_checkin_pin");
  if (!error && typeof data === "string" && data.length === PIN_LENGTH) return data;
  // The RPC is only a convenience; fall back to a CSPRNG over the same alphabet.
  return randomPin();
}

export type PerformCheckinInput = {
  churchId: string;
  /** auth.users id of whoever is operating: the staff admin, or the admin who started the kiosk. */
  actorLoginId: string;
  serviceId: string;
  roomId: string;
  childProfileId?: string | null;
  /** Used when there is no child profile (staff walk-in). Ignored for a kiosk. */
  childName?: string;
  guardianName?: string | null;
  guardianPhone?: string | null;
  isFirstVisit?: boolean;
  source: CheckinSource;
};

export type PerformCheckinResult =
  | { status: "checked_in"; session: CcmCheckinSession; pin: string }
  | { status: "already" }
  | { status: "closed"; reason: ServiceGateReason }
  | { status: "invalid_room" }
  | { status: "invalid_child" };

export async function performCheckin(input: PerformCheckinInput): Promise<PerformCheckinResult> {
  const admin = createTenantAdminClient();

  const { data: service, error: serviceError } = await admin
    .from("ccm_services")
    .select(
      "ministry_id, status, checkin_session_status, checkin_session_starts_at, checkin_session_ends_at",
    )
    .eq("id", input.serviceId)
    .eq("church_id", input.churchId)
    .maybeSingle();
  if (serviceError) throw new Error("Check-in could not be recorded.");
  if (!service) return { status: "closed", reason: "not_open" };

  const gateReason = evaluateServiceGate(service as ServiceGateRow);
  if (gateReason) return { status: "closed", reason: gateReason };

  const { data: room, error: roomError } = await admin
    .from("children_rooms")
    .select("id, name")
    .eq("id", input.roomId)
    .eq("church_id", input.churchId)
    .eq("ministry_id", (service as ServiceGateRow).ministry_id)
    .eq("is_active", true)
    .maybeSingle();
  if (roomError) throw new Error("Check-in could not be recorded.");
  if (!room) return { status: "invalid_room" };

  let childName = input.childName?.trim() ?? "";
  if (input.childProfileId) {
    const { data: child, error: childError } = await admin
      .from("profiles")
      .select("id, full_name")
      .eq("id", input.childProfileId)
      .eq("church_id", input.churchId)
      .is("merged_at", null)
      .maybeSingle();
    if (childError) throw new Error("Check-in could not be recorded.");
    if (!child) return { status: "invalid_child" };
    const profileName = (child as { full_name: string | null }).full_name?.trim() ?? "";
    // A kiosk never trusts a browser-supplied name.
    childName = input.source === "kiosk" || !childName ? profileName : childName;
  }
  if (!childName) return { status: "invalid_child" };

  const plainPin = await generatePin(admin);
  const pinHash = await bcrypt.hash(plainPin, PIN_BCRYPT_COST);

  const { data, error } = await admin
    .from("ccm_checkin_sessions")
    .insert({
      church_id: input.churchId,
      service_id: input.serviceId,
      room_id: input.roomId,
      child_profile_id: input.childProfileId ?? null,
      child_name: childName,
      guardian_name: input.guardianName ?? null,
      guardian_phone: input.guardianPhone ?? null,
      pin_hash: pinHash,
      current_room_id: input.roomId,
      is_first_visit: input.isFirstVisit ?? false,
      checked_in_by: input.actorLoginId,
      checkin_source: input.source,
    })
    .select(
      "id, service_id, room_id, child_profile_id, child_name, guardian_name, qr_token, status, current_room_id, is_first_visit, checked_in_at",
    )
    .single();

  if (error) {
    // 23505: the one-active-check-in-per-child-per-service index. A double tap or
    // a retry after a lost response lands here: report it, issue no second PIN.
    if (error.code === "23505") return { status: "already" };
    throw new Error("Check-in could not be recorded.");
  }
  if (!data) throw new Error("Check-in could not be recorded.");

  const row = data as {
    id: string;
    service_id: string;
    room_id: string;
    child_profile_id: string | null;
    child_name: string;
    guardian_name: string | null;
    qr_token: string;
    current_room_id: string | null;
    is_first_visit: boolean;
    checked_in_at: string;
  };

  const session: CcmCheckinSession = {
    id: row.id,
    serviceId: row.service_id,
    roomId: row.room_id,
    roomName: (room as { name: string }).name,
    childProfileId: row.child_profile_id,
    childName: row.child_name,
    guardianName: row.guardian_name,
    qrToken: row.qr_token,
    status: "checked_in",
    currentRoomId: row.current_room_id,
    currentRoomName: null,
    isFirstVisit: row.is_first_visit,
    checkedInAt: row.checked_in_at,
    checkedOutAt: null,
    releasedToName: null,
    silentPageSentAt: null,
    latePickupNotifiedAt: null,
    criticalAllergies: [],
    allAllergies: [],
    noPhotoFlag: false,
  };

  return { status: "checked_in", session, pin: plainPin };
}
