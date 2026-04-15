"use server";

import { revalidatePath } from "next/cache";

import type { ChurchAppSession } from "@/lib/auth";
import {
  createTenantServerClient,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";
import { sendEmail } from "./send-email";
import { sendSms } from "./send-sms";

/**
 * queueCommunicationAction
 *
 * Consent-aware dispatcher for outbound messages.
 * Flow:
 *  1. Look up recipient's notification_preferences (or use sensible defaults).
 *  2. Check the requested channel is opted in.
 *  3. Dispatch to sendEmail / sendSms.
 *  4. Write a communication_logs row for audit.
 *
 * This function is intentionally simple — it handles one recipient at a
 * time. Bulk sends loop over this or call the channel functions directly
 * after checking consent at the list level.
 */

export interface QueueCommunicationInput {
  /** Church-app session (used for church_id + sent_by). */
  session: ChurchAppSession;
  /** Target profile id — null means system/broadcast (no per-recipient consent check). */
  recipientProfileId: string | null;
  /** Recipient contact detail (email address or E.164 phone number). */
  recipientContact: string;
  channel: "email" | "sms" | "push" | "in_app";
  subject?: string;
  /** Plain-text message body. */
  body: string;
  /** Optional HTML for email channel. */
  html?: string;
  /** ISO datetime string — if set, log is recorded but send is deferred. */
  scheduledFor?: string;
}

export interface QueueCommunicationResult {
  sent: boolean;
  skipped: boolean;
  skipReason?: string;
  externalId?: string;
  logId?: string;
  error?: string;
}

export async function queueCommunicationAction(
  input: QueueCommunicationInput,
): Promise<QueueCommunicationResult> {
  const churchId = input.session.appContext.church.id;
  const callerProfileId = input.session.profile.id ?? null;

  // ── 1. Consent check ─────────────────────────────────────────
  if (input.recipientProfileId) {
    const optedIn = await checkOptIn(churchId, input.recipientProfileId, input.channel);
    if (!optedIn) {
      return {
        sent: false,
        skipped: true,
        skipReason: `Recipient has opted out of ${input.channel} communications.`,
      };
    }
  }

  // ── 2. Dispatch (unless scheduled for the future) ────────────
  let externalId: string | undefined;
  let sendError: string | undefined;

  const isScheduled =
    input.scheduledFor != null && new Date(input.scheduledFor) > new Date();

  if (!isScheduled) {
    if (input.channel === "email") {
      const result = await sendEmail({
        to: input.recipientContact,
        subject: input.subject ?? "(no subject)",
        text: input.body,
        html: input.html,
      });
      externalId = result.messageId;
      if (!result.accepted) sendError = result.error;
    } else if (input.channel === "sms") {
      const result = await sendSms({
        to: input.recipientContact,
        body: input.body,
      });
      externalId = result.sid;
      if (!result.accepted) sendError = result.error;
    }
    // push and in_app: handled by in-app notification system (Phase 7)
  }

  const status = isScheduled
    ? "queued"
    : sendError
      ? "failed"
      : "sent";

  // ── 3. Write audit log ────────────────────────────────────────
  const logId = await writeLog({
    churchId,
    sentBy: callerProfileId,
    recipientId: input.recipientProfileId,
    channel: input.channel,
    subject: input.subject,
    bodyPreview: input.body.slice(0, 500),
    externalId,
    status,
    errorMessage: sendError,
    scheduledFor: input.scheduledFor,
    sentAt: isScheduled || sendError ? undefined : new Date().toISOString(),
  });

  revalidatePath("/app/communications");

  return {
    sent: !isScheduled && !sendError,
    skipped: false,
    externalId,
    logId,
    error: sendError,
  };
}

// ── Helpers ──────────────────────────────────────────────────

async function checkOptIn(
  churchId: string,
  profileId: string,
  channel: "email" | "sms" | "push" | "in_app",
): Promise<boolean> {
  const columnMap: Record<typeof channel, string> = {
    email: "email_opt_in",
    sms: "sms_opt_in",
    push: "push_opt_in",
    in_app: "in_app_opt_in",
  };
  const col = columnMap[channel];

  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{ opted_in: boolean }>(
      `select ${col} as opted_in
       from public.notification_preferences
       where church_id = $1 and profile_id = $2
       limit 1`,
      [churchId, profileId],
    );
    if (result.rows.length === 0) {
      // No preferences row → use defaults: email/push/in_app on, sms off
      return channel !== "sms";
    }
    return result.rows[0].opted_in;
  }

  const supabase = await createTenantServerClient();
  const { data } = await supabase
    .from("notification_preferences")
    .select(col)
    .eq("church_id", churchId)
    .eq("profile_id", profileId)
    .maybeSingle();

  if (!data) return channel !== "sms";
  return Boolean((data as unknown as Record<string, unknown>)[col]);
}

interface LogInput {
  churchId: string;
  sentBy: string | null;
  recipientId: string | null;
  channel: string;
  subject?: string;
  bodyPreview: string;
  externalId?: string;
  status: string;
  errorMessage?: string;
  scheduledFor?: string;
  sentAt?: string;
}

async function writeLog(log: LogInput): Promise<string | undefined> {
  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{ id: string }>(
      `insert into public.communication_logs
         (church_id, sent_by, recipient_id, channel, subject, body_preview,
          external_id, status, error_message, scheduled_for, sent_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       returning id`,
      [
        log.churchId,
        log.sentBy,
        log.recipientId,
        log.channel,
        log.subject ?? null,
        log.bodyPreview,
        log.externalId ?? null,
        log.status,
        log.errorMessage ?? null,
        log.scheduledFor ?? null,
        log.sentAt ?? null,
      ],
    );
    return result.rows[0]?.id;
  }

  const supabase = await createTenantServerClient();
  const { data } = await supabase
    .from("communication_logs")
    .insert({
      church_id: log.churchId,
      sent_by: log.sentBy,
      recipient_id: log.recipientId,
      channel: log.channel,
      subject: log.subject,
      body_preview: log.bodyPreview,
      external_id: log.externalId,
      status: log.status,
      error_message: log.errorMessage,
      scheduled_for: log.scheduledFor,
      sent_at: log.sentAt,
    })
    .select("id")
    .single();

  return (data as { id?: string } | null)?.id;
}
