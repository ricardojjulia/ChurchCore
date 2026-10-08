"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";

import { logAuditEvent } from "@/lib/actions/audit";
import { requireChurchSession } from "@/lib/auth";
import { KIOSK_HOME_PATH } from "@/lib/ccm-kiosk-constants";
import { setKioskCookie } from "@/lib/ccm-kiosk-core";
import { createTenantAdminClient } from "@/lib/supabase/tenant";

const START_PATH = "/app/church-admin/children/kiosk";
const DEVICE_NOTE_MAX = 80;

/**
 * Starts kiosk mode on this browser: a church admin only. Records the session,
 * sets the httpOnly cc_kiosk cookie and sends the tablet to the kiosk start
 * screen. Use as a <form action>; an optional `deviceNote` field (e.g. "Lobby
 * iPad") is stored and audited. A non-admin is refused before anything is
 * written or audited.
 */
export async function startKioskAction(formData?: FormData): Promise<void> {
  const session = await requireChurchSession(START_PATH);
  if (session.appContext.roleId !== "church-admin") {
    throw new Error("Unauthorized: kiosk mode requires the church-admin role.");
  }

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
