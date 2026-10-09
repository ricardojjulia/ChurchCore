"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";

import { logAuditEvent } from "@/lib/actions/audit";
import { requireChurchSession } from "@/lib/auth";
import { KIOSK_HOME_PATH } from "@/lib/ccm-kiosk-constants";
import { hashExitPin, isValidExitPin, setKioskCookie } from "@/lib/ccm-kiosk-core";
import { createTenantAdminClient } from "@/lib/supabase/tenant";

const START_PATH = "/app/church-admin/children/kiosk";
const DEVICE_NOTE_MAX = 80;

export type StartKioskState =
  | { status: "invalid_pin" }
  | { status: "pin_mismatch" };

/**
 * Starts kiosk mode on this browser: a church admin only. The admin chooses a
 * 6-digit exit PIN (form fields `exitPin` and `exitPinConfirm`); it is stored
 * only as a bcrypt hash and is what leaving the kiosk later asks for. Records the
 * session, sets the httpOnly cc_kiosk cookie and redirects to the kiosk start
 * screen. Usable as a plain `<form action>` or through `useActionState` (a
 * leading previous-state argument is accepted). An optional `deviceNote` field
 * (e.g. "Lobby iPad", max 80 characters) is stored and audited. A non-admin is
 * refused before anything is written or audited; a bad PIN returns
 * `invalid_pin` / `pin_mismatch` and writes nothing.
 */
export async function startKioskAction(
  first?: FormData | StartKioskState | null,
  second?: FormData,
): Promise<StartKioskState | void> {
  const formData = first instanceof FormData ? first : second;
  const session = await requireChurchSession(START_PATH);
  if (session.appContext.roleId !== "church-admin") {
    throw new Error("Unauthorized: kiosk mode requires the church-admin role.");
  }

  const exitPin = formData?.get("exitPin");
  if (!isValidExitPin(exitPin)) return { status: "invalid_pin" };
  if (formData?.get("exitPinConfirm") !== exitPin) return { status: "pin_mismatch" };
  const exitPinHash = await hashExitPin(exitPin);

  const rawNote = formData?.get("deviceNote");
  const deviceNote =
    typeof rawNote === "string" ? rawNote.trim().slice(0, DEVICE_NOTE_MAX) || null : null;

  const churchId = session.appContext.church.id;
  const kioskSessionId = randomUUID();
  const startedAt = new Date().toISOString();

  const admin = createTenantAdminClient();
  const { data, error } = await admin
    .from("ccm_kiosk_sessions")
    .insert({
      id: kioskSessionId,
      church_id: churchId,
      admin_login_id: session.userId,
      device_note: deviceNote,
      exit_pin_hash: exitPinHash,
      started_at: startedAt,
    })
    .select("id");
  if (error || !data || data.length !== 1) {
    throw new Error("Kiosk mode could not be started.");
  }

  try {
    await logAuditEvent({
      tableName: "ccm_kiosk_sessions",
      recordId: kioskSessionId,
      operation: "INSERT",
      actorId: session.userId,
      churchId,
      actorRole: "church-admin",
      newValues: { event: "kiosk.start", deviceNote, startedAt },
    });
  } catch {
    // Do not leave an active kiosk that has no audit record.
    await admin
      .from("ccm_kiosk_sessions")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", kioskSessionId)
      .eq("church_id", churchId);
    throw new Error("Kiosk mode could not be started.");
  }

  await setKioskCookie(kioskSessionId);
  redirect(KIOSK_HOME_PATH);
}
