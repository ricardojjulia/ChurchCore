"use server";

import { revalidatePath } from "next/cache";

import { logAuditEvent } from "@/lib/actions/audit";
import { requireChurchSession } from "@/lib/auth";
import {
  cancelRecurringGift,
  confirmRecurringGift,
  setRecurringGiftPaused,
  startRecurringGift,
  updateRecurringGift,
  type RecurringGift,
  type StartRecurringGiftInput,
  type StartRecurringGiftResult,
} from "@/lib/recurring-gifts";
import { createTenantAdminClient } from "@/lib/supabase/tenant";

// Recurring gifts (G3.1). Each action authenticates its own caller and takes
// the church and profile from the session, never from the caller.

type Result = { ok: true; gift: RecurringGift } | { ok: false; error: string };

const MEMBER_PATH = "/app/member/giving";
const ADMIN_PATH = "/app/church-admin/giving";
const FAILED = "Couldn't update your recurring gift. Please try again.";

async function memberContext() {
  const session = await requireChurchSession(MEMBER_PATH);
  const profileId = session.churchProfileId;
  return {
    session,
    churchId: session.appContext.church.id,
    profileId,
    timeZone: session.appContext.church.timezone ?? null,
  };
}

async function guard(run: () => Promise<Result>, path: string): Promise<Result> {
  try {
    const result = await run();
    if (result.ok) revalidatePath(path);
    return result;
  } catch (error) {
    console.error("[recurring-gifts]", error instanceof Error ? error.message : error);
    return { ok: false, error: FAILED };
  }
}

/** Starts the member's recurring gift; returns Stripe's card step (null when stubbed). */
export async function startRecurringGiftAction(input: StartRecurringGiftInput): Promise<StartRecurringGiftResult> {
  const { churchId, profileId, timeZone } = await memberContext();
  if (!profileId) return { ok: false, error: "Your account has no profile in this church." };
  try {
    return await startRecurringGift(createTenantAdminClient(), { churchId, profileId, timeZone }, input);
  } catch (error) {
    console.error("[recurring-gifts] Start failed:", error instanceof Error ? error.message : error);
    return { ok: false, error: "Couldn't start your recurring gift. Please try again." };
  }
}

/** After the card step: records the subscription's state as Stripe reports it. */
export async function confirmRecurringGiftAction(recurringGiftId: string): Promise<Result> {
  const { churchId, profileId } = await memberContext();
  if (!profileId) return { ok: false, error: "Your account has no profile in this church." };
  return guard(() => confirmRecurringGift(createTenantAdminClient(), churchId, profileId, recurringGiftId), MEMBER_PATH);
}

/** Changes the member's own gift: amount, fund or frequency, from the next installment on. */
export async function updateRecurringGiftAction(
  recurringGiftId: string,
  change: { amountCents?: number; fundDesignation?: string | null; frequency?: string },
): Promise<Result> {
  const { churchId, profileId } = await memberContext();
  if (!profileId) return { ok: false, error: "Your account has no profile in this church." };
  return guard(() => updateRecurringGift(createTenantAdminClient(), churchId, profileId, recurringGiftId, change), MEMBER_PATH);
}

/** Pauses or resumes the member's own gift. */
export async function setRecurringGiftPausedAction(recurringGiftId: string, paused: boolean): Promise<Result> {
  const { churchId, profileId } = await memberContext();
  if (!profileId) return { ok: false, error: "Your account has no profile in this church." };
  return guard(() => setRecurringGiftPaused(createTenantAdminClient(), churchId, profileId, recurringGiftId, paused), MEMBER_PATH);
}

/** Cancels the member's own gift (also used when they leave the card step). */
export async function cancelRecurringGiftAction(recurringGiftId: string): Promise<Result> {
  const { churchId, profileId } = await memberContext();
  if (!profileId) return { ok: false, error: "Your account has no profile in this church." };
  return guard(() => cancelRecurringGift(createTenantAdminClient(), churchId, profileId, recurringGiftId), MEMBER_PATH);
}

async function adminContext() {
  const session = await requireChurchSession(ADMIN_PATH);
  if (session.appContext.roleId !== "church-admin") return null;
  return { session, churchId: session.appContext.church.id };
}

async function audit(session: Awaited<ReturnType<typeof requireChurchSession>>, recurringGiftId: string, change: Record<string, unknown>) {
  await logAuditEvent({
    tableName: "recurring_gifts",
    recordId: recurringGiftId,
    operation: "UPDATE",
    actorId: session.userId,
    churchId: session.appContext.church.id,
    actorRole: session.appContext.roleId,
    newValues: change,
  }).catch((error) => console.error("[recurring-gifts] Audit log failed:", error));
}

/** A church admin pauses or resumes any recurring gift in the church. */
export async function adminSetRecurringGiftPausedAction(recurringGiftId: string, paused: boolean): Promise<Result> {
  const ctx = await adminContext();
  if (!ctx) return { ok: false, error: "Only a church administrator can manage recurring gifts." };
  const result = await guard(
    () => setRecurringGiftPaused(createTenantAdminClient(), ctx.churchId, null, recurringGiftId, paused),
    ADMIN_PATH,
  );
  if (result.ok) await audit(ctx.session, recurringGiftId, { status: result.gift.status });
  return result;
}

/** A church admin cancels any recurring gift in the church (at the giver's request, say). */
export async function adminCancelRecurringGiftAction(recurringGiftId: string): Promise<Result> {
  const ctx = await adminContext();
  if (!ctx) return { ok: false, error: "Only a church administrator can manage recurring gifts." };
  const result = await guard(() => cancelRecurringGift(createTenantAdminClient(), ctx.churchId, null, recurringGiftId), ADMIN_PATH);
  if (result.ok) await audit(ctx.session, recurringGiftId, { status: "cancelled" });
  return result;
}
