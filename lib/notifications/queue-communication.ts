"use server";

import { revalidatePath } from "next/cache";

import type { ChurchAppSession } from "@/lib/auth";
import {
  createTenantServerClient,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";
import { sendgridAdapter } from "@/lib/communications/sendgrid-adapter";
import { twilioAdapter } from "@/lib/communications/twilio-adapter";

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
  retryCount?: number;
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
  let errorCode: string | undefined;
  let provider: "sendgrid" | "twilio" | undefined;

  const isScheduled =
    input.scheduledFor != null && new Date(input.scheduledFor) > new Date();

  if (!isScheduled) {
    if (input.channel === "email") {
      provider = "sendgrid";
      const result = await sendgridAdapter.send({
        to: input.recipientContact,
        subject: input.subject,
        body: input.body,
        html: input.html,
      });
      externalId = result.providerMessageId;
      errorCode = result.errorCode;
      if (!result.accepted) sendError = result.errorMessage;
    } else if (input.channel === "sms") {
      provider = "twilio";
      const result = await twilioAdapter.send({
        to: input.recipientContact,
        body: input.body,
      });
      externalId = result.providerMessageId;
      errorCode = result.errorCode;
      if (!result.accepted) sendError = result.errorMessage;
    }
    // push and in_app: handled by in-app notification system (Phase 7)
  }

  const status = isScheduled
    ? "scheduled"
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
    provider,
    providerMessageId: externalId,
    status,
    errorMessage: sendError,
    errorCode,
    scheduledFor: input.scheduledFor,
    sentAt: isScheduled || sendError ? undefined : new Date().toISOString(),
    retryCount: input.retryCount,
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
  provider?: "sendgrid" | "twilio";
  providerMessageId?: string;
  status: string;
  errorMessage?: string;
  errorCode?: string;
  scheduledFor?: string;
  sentAt?: string;
  retryCount?: number;
}

async function writeLog(log: LogInput): Promise<string | undefined> {
  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{ id: string }>(
      `insert into public.communication_logs
         (church_id, sent_by, recipient_id, channel, subject, body_preview,
          external_id, provider, provider_message_id, status, error_message, error_code,
          scheduled_for, sent_at, retry_count, last_retry_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
         case when $15 > 0 then now() else null end)
       returning id`,
      [
        log.churchId,
        log.sentBy,
        log.recipientId,
        log.channel,
        log.subject ?? null,
        log.bodyPreview,
        log.externalId ?? null,
        log.provider ?? null,
        log.providerMessageId ?? null,
        log.status,
        log.errorMessage ?? null,
        log.errorCode ?? null,
        log.scheduledFor ?? null,
        log.sentAt ?? null,
        log.retryCount ?? 0,
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
      provider: log.provider,
      provider_message_id: log.providerMessageId,
      status: log.status,
      error_message: log.errorMessage,
      error_code: log.errorCode,
      scheduled_for: log.scheduledFor,
      sent_at: log.sentAt,
      retry_count: log.retryCount ?? 0,
      last_retry_at: (log.retryCount ?? 0) > 0 ? new Date().toISOString() : null,
    })
    .select("id")
    .single();

  return (data as { id?: string } | null)?.id;
}
