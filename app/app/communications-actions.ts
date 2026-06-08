"use server";

import { revalidatePath } from "next/cache";

import { requireChurchSession } from "@/lib/auth";
import {
  type CommunicationDeliveryEvent,
  type CommunicationRecipient,
  getCommunicationDeliveryEvents,
} from "@/lib/communications-data";
import type {
  CommunicationChannel,
  CommunicationLogSummary,
  CommunicationTemplate,
  ComposeMessageInput,
  MessageAnalytics,
  RecipientPreviewResult,
  SegmentFilter,
} from "@/lib/communications-types";
import { resolveRecipients } from "@/lib/communications/recipient-resolver";
import { shouldRetryDelivery } from "@/lib/communications/provider-adapter";
import {
  type RetryEligibleResult,
  retryEligibleCommunications,
} from "@/lib/communications/retry-eligible";
import { sendWithSuppression } from "@/lib/communications/send-with-suppression";
import { insertConsentLogEntries } from "@/lib/consent-log";
import { hasTenantBackendEnv } from "@/lib/supabase/tenant";

export interface BroadcastMessageInput {
  recipientIds: string[];
  channel: "email" | "sms";
  subject?: string;
  body: string;
  /** ISO datetime — if set, logs as queued instead of sending immediately. */
  scheduledFor?: string;
}

export interface UpdateNotificationPreferencesInput {
  profileId: string;
  emailOptIn: boolean;
  smsOptIn: boolean;
  pushOptIn: boolean;
  inAppOptIn: boolean;
}

function normalizeScheduledFor(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Scheduled send time is invalid.");
  }

  if (parsed.getTime() <= Date.now()) {
    throw new Error("Scheduled send time must be in the future.");
  }

  return parsed.toISOString();
}

/**
 * Sends a message to one or more recipients.
 * Each recipient is checked for consent and suppression individually.
 */
export async function broadcastMessageAction(
  recipients: CommunicationRecipient[],
  input: BroadcastMessageInput,
): Promise<{ sent: number; skipped: number; errors: number }> {
  const session = await requireChurchSession("/app/pastor");
  const role = session.appContext.roleId;
  if (role !== "pastor" && role !== "church-admin" && role !== "secretary") {
    throw new Error("Only pastors and church administrators may send communications.");
  }

  const normalizedBody = input.body.trim();
  if (!normalizedBody) {
    throw new Error("Message body is required.");
  }

  const normalizedSubject = input.subject?.trim();
  if (input.channel === "email" && !normalizedSubject) {
    throw new Error("Email subject is required.");
  }

  const normalizedScheduledFor = normalizeScheduledFor(input.scheduledFor);

  let sent = 0;
  let skipped = 0;
  let errors = 0;

  const selected = recipients.filter((r) => input.recipientIds.includes(r.profileId));

  for (const recipient of selected) {
    const contact = input.channel === "email" ? recipient.email : recipient.phone;
    if (!contact) {
      skipped++;
      continue;
    }

    const result = await sendWithSuppression({
      session,
      recipientProfileId: recipient.profileId,
      recipientContact: contact,
      channel: input.channel,
      subject: normalizedSubject,
      body: normalizedBody,
      scheduledFor: normalizedScheduledFor,
    });

    if (result.skipped) skipped++;
    else if (result.error) errors++;
    else sent++;
  }

  revalidatePath("/app/communications");
  return { sent, skipped, errors };
}

export async function retryCommunicationAction(input: {
  logId: string;
}): Promise<{ retried: boolean; reason?: string }> {
  const session = await requireChurchSession("/app/pastor");
  const role = session.appContext.roleId;
  if (role !== "pastor" && role !== "church-admin" && role !== "secretary") {
    throw new Error("Only pastors and church administrators may retry communications.");
  }

  const churchId = session.appContext.church.id;

  const {
    queryTenantLocalDb,
    shouldUseLocalTenantFallback,
    createTenantServerClient,
  } = await import("@/lib/supabase/tenant");

  type RetryRow = {
    id: string;
    recipient_id: string | null;
    channel: "email" | "sms";
    subject: string | null;
    body_preview: string | null;
    status:
      | "failed"
      | "bounced"
      | "suppressed"
      | "unsubscribed"
      | "sending"
      | "scheduled"
      | "queued";
    error_code: string | null;
    retry_count: number;
  };

  type ContactRow = {
    email: string | null;
    phone: string | null;
  };

  let log: RetryRow | null = null;
  let contactRow: ContactRow | null = null;

  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<RetryRow>(
      `
        select id, recipient_id, channel, subject, body_preview, status, error_code, retry_count
        from public.communication_logs
        where church_id = $1
          and id = $2
        limit 1
      `,
      [churchId, input.logId],
    );
    log = result.rows[0] ?? null;
  } else {
    const supabase = await createTenantServerClient();
    const { data: logData, error: logError } = await supabase
      .from("communication_logs")
      .select("id, recipient_id, channel, subject, body_preview, status, error_code, retry_count")
      .eq("church_id", churchId)
      .eq("id", input.logId)
      .maybeSingle();

    if (logError) {
      throw new Error(logError.message);
    }

    log = (logData as RetryRow | null) ?? null;

  }

  if (!log) {
    throw new Error("Communication log not found.");
  }

  if (log.retry_count >= 3) {
    return { retried: false, reason: "Retry limit reached." };
  }

  if (!shouldRetryDelivery(log.status, log.error_code ?? undefined)) {
    return { retried: false, reason: "This communication is not eligible for retry." };
  }

  if (!log.recipient_id) {
    throw new Error("Retry is only supported for recipient-bound logs.");
  }

  if (shouldUseLocalTenantFallback()) {
    const profileResult = await queryTenantLocalDb<ContactRow>(
      `
        select email, phone
        from public.profiles
        where id = $1
          and church_id = $2
        limit 1
      `,
      [log.recipient_id, churchId],
    );
    contactRow = profileResult.rows[0] ?? null;
  } else {
    const supabase = await createTenantServerClient();
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("email, phone")
      .eq("id", log.recipient_id)
      .eq("church_id", churchId)
      .maybeSingle();

    if (profileError) {
      throw new Error(profileError.message);
    }

    contactRow = (profileData as ContactRow | null) ?? null;
  }

  const contact = log.channel === "email" ? contactRow?.email ?? null : contactRow?.phone ?? null;
  if (!contact) {
    throw new Error("Recipient contact information is missing.");
  }

  const result = await sendWithSuppression({
    session,
    recipientProfileId: log.recipient_id,
    recipientContact: contact,
    channel: log.channel,
    subject: log.subject ?? undefined,
    body: log.body_preview ?? "",
    retryCount: log.retry_count + 1,
  });

  revalidatePath("/app/communications");

  if (result.error) {
    return { retried: false, reason: result.error };
  }

  return { retried: true };
}

export async function getCommunicationDeliveryEventsAction(input: {
  logId: string;
}): Promise<CommunicationDeliveryEvent[]> {
  const session = await requireChurchSession("/app/pastor");
  const role = session.appContext.roleId;
  if (role !== "pastor" && role !== "church-admin" && role !== "secretary") {
    throw new Error("Only pastors and church administrators may review delivery events.");
  }

  return getCommunicationDeliveryEvents(session, input.logId);
}

export async function suppressContactAction(input: {
  channel: "email" | "sms";
  contact: string;
  reason: "manual";
  notes?: string;
}): Promise<void> {
  const session = await requireChurchSession("/app/church-admin/people");
  if (session.appContext.roleId !== "church-admin") {
    throw new Error("Only church administrators may suppress contacts.");
  }

  const churchId = session.appContext.church.id;
  const profileId = session.profile.id ?? null;
  const normalizedContact =
    input.channel === "email" ? input.contact.trim().toLowerCase() : input.contact.trim();

  if (!normalizedContact) {
    throw new Error("A valid contact is required.");
  }

  const {
    queryTenantLocalDb,
    shouldUseLocalTenantFallback,
    createTenantServerClient,
  } = await import("@/lib/supabase/tenant");

  let matchedProfileId: string | null = null;

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `
        insert into public.communication_suppressions
          (church_id, channel, contact, reason, notes, suppressed_by)
        values ($1, $2, $3, $4, $5, $6)
        on conflict (church_id, channel, contact) do update
          set reason = excluded.reason,
              notes = excluded.notes,
              suppressed_by = excluded.suppressed_by,
              created_at = timezone('utc', now())
      `,
      [churchId, input.channel, normalizedContact, input.reason, input.notes ?? null, profileId],
    );

    const matchResult = await queryTenantLocalDb<{ id: string }>(
      `
        select id
        from public.profiles
        where church_id = $1
          and merged_at is null
          and (
            ($2 = 'email' and lower(coalesce(email, '')) = lower($3))
            or
            ($2 = 'sms' and coalesce(phone, '') = $3)
          )
        limit 1
      `,
      [churchId, input.channel, normalizedContact],
    );
    matchedProfileId = matchResult.rows[0]?.id ?? null;
  } else {
    const supabase = await createTenantServerClient();
    const { error } = await supabase.from("communication_suppressions").upsert(
      {
        church_id: churchId,
        channel: input.channel,
        contact: normalizedContact,
        reason: input.reason,
        notes: input.notes ?? null,
        suppressed_by: profileId,
        created_at: new Date().toISOString(),
      },
      {
        onConflict: "church_id,channel,contact",
      },
    );

    if (error) {
      throw new Error(error.message);
    }

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("church_id", churchId)
      .is("merged_at", null)
      .or(
        input.channel === "email"
          ? `email.ilike.${normalizedContact}`
          : `phone.eq.${normalizedContact}`,
      )
      .maybeSingle();

    if (profileError) {
      throw new Error(profileError.message);
    }

    matchedProfileId = (profileData as { id?: string } | null)?.id ?? null;
  }

  if (matchedProfileId) {
    await insertConsentLogEntries([
      {
        churchId,
        profileId: matchedProfileId,
        consentType: "communication_suppression",
        consented: false,
        communicationType: input.channel,
      },
    ]);
  }

  revalidatePath("/app/communications");
}

/**
 * Upserts notification_preferences for the target profile.
 * Members may update self; pastors/admins may update any profile in church.
 */
export async function updateNotificationPreferencesAction(
  input: UpdateNotificationPreferencesInput,
): Promise<void> {
  const session = await requireChurchSession("/app/member");
  const churchId = session.appContext.church.id;
  const isManager =
    session.appContext.roleId === "pastor" || session.appContext.roleId === "church-admin";

  const {
    queryTenantLocalDb,
    shouldUseLocalTenantFallback,
    createTenantServerClient,
  } = await import("@/lib/supabase/tenant");

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    throw new Error("Backend not configured. Supabase connection required.");
  }

  if (shouldUseLocalTenantFallback()) {
    const targetProfileResult = await queryTenantLocalDb<{
      id: string;
      user_id: string;
      church_id: string;
    }>(
      `
        select id, user_id, church_id
        from public.profiles
        where id = $1
          and church_id = $2
          and merged_at is null
        limit 1
      `,
      [input.profileId, churchId],
    );
    const targetProfile = targetProfileResult.rows[0];

    if (!targetProfile) {
      throw new Error("Profile not found.");
    }

    const isSelf = targetProfile.user_id === session.userId;

    if (!isSelf && !isManager) {
      throw new Error("You may only update your own notification preferences.");
    }

    const existingResult = await queryTenantLocalDb<{
      email_opt_in: boolean;
      sms_opt_in: boolean;
      push_opt_in: boolean;
      in_app_opt_in: boolean;
    }>(
      `
        select email_opt_in, sms_opt_in, push_opt_in, in_app_opt_in
        from public.notification_preferences
        where church_id = $1
          and profile_id = $2
        limit 1
      `,
      [churchId, input.profileId],
    );
    const existing = existingResult.rows[0] ?? null;

    await queryTenantLocalDb(
      `insert into public.notification_preferences
         (church_id, profile_id, email_opt_in, sms_opt_in, push_opt_in, in_app_opt_in, updated_at)
       values ($1, $2, $3, $4, $5, $6, now())
       on conflict (church_id, profile_id) do update
         set email_opt_in  = excluded.email_opt_in,
             sms_opt_in    = excluded.sms_opt_in,
             push_opt_in   = excluded.push_opt_in,
             in_app_opt_in = excluded.in_app_opt_in,
             updated_at    = now()`,
      [
        churchId,
        input.profileId,
        input.emailOptIn,
        input.smsOptIn,
        input.pushOptIn,
        input.inAppOptIn,
      ],
    );

    const consentEntries = [
      {
        changed: !existing || existing.email_opt_in !== input.emailOptIn,
        consentType: "communication_preferences",
        consented: input.emailOptIn,
        communicationType: "email" as const,
      },
      {
        changed: !existing || existing.sms_opt_in !== input.smsOptIn,
        consentType: "communication_preferences",
        consented: input.smsOptIn,
        communicationType: "sms" as const,
      },
      {
        changed: !existing || existing.push_opt_in !== input.pushOptIn,
        consentType: "communication_preferences",
        consented: input.pushOptIn,
        communicationType: "push" as const,
      },
      {
        changed: !existing || existing.in_app_opt_in !== input.inAppOptIn,
        consentType: "communication_preferences",
        consented: input.inAppOptIn,
        communicationType: "in_app" as const,
      },
    ]
      .filter((entry) => entry.changed)
      .map((entry) => ({
        churchId,
        profileId: input.profileId,
        consentType: entry.consentType,
        consented: entry.consented,
        communicationType: entry.communicationType,
      }));

    await insertConsentLogEntries(consentEntries);
  } else {
    const supabase = await createTenantServerClient();
    const { data: targetProfile, error: profileError } = await supabase
      .from("profiles")
      .select("id, user_id")
      .eq("id", input.profileId)
      .eq("church_id", churchId)
      .is("merged_at", null)
      .maybeSingle();

    if (profileError) {
      throw new Error(profileError.message);
    }

    if (!targetProfile) {
      throw new Error("Profile not found.");
    }

    const isSelf = targetProfile.user_id === session.userId;

    if (!isSelf && !isManager) {
      throw new Error("You may only update your own notification preferences.");
    }

    const { data: existing, error: existingError } = await supabase
      .from("notification_preferences")
      .select("email_opt_in, sms_opt_in, push_opt_in, in_app_opt_in")
      .eq("church_id", churchId)
      .eq("profile_id", input.profileId)
      .maybeSingle();

    if (existingError) {
      throw new Error(existingError.message);
    }

    const { error } = await supabase.from("notification_preferences").upsert({
      church_id: churchId,
      profile_id: input.profileId,
      email_opt_in: input.emailOptIn,
      sms_opt_in: input.smsOptIn,
      push_opt_in: input.pushOptIn,
      in_app_opt_in: input.inAppOptIn,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      throw new Error(error.message);
    }

    const consentEntries = [
      {
        changed: !existing || existing.email_opt_in !== input.emailOptIn,
        consentType: "communication_preferences",
        consented: input.emailOptIn,
        communicationType: "email" as const,
      },
      {
        changed: !existing || existing.sms_opt_in !== input.smsOptIn,
        consentType: "communication_preferences",
        consented: input.smsOptIn,
        communicationType: "sms" as const,
      },
      {
        changed: !existing || existing.push_opt_in !== input.pushOptIn,
        consentType: "communication_preferences",
        consented: input.pushOptIn,
        communicationType: "push" as const,
      },
      {
        changed: !existing || existing.in_app_opt_in !== input.inAppOptIn,
        consentType: "communication_preferences",
        consented: input.inAppOptIn,
        communicationType: "in_app" as const,
      },
    ]
      .filter((entry) => entry.changed)
      .map((entry) => ({
        churchId,
        profileId: input.profileId,
        consentType: entry.consentType,
        consented: entry.consented,
        communicationType: entry.communicationType,
      }));

    await insertConsentLogEntries(consentEntries);
  }

  revalidatePath("/app/communications");
  revalidatePath("/app/member");
}

export async function retryAllEligibleAction(): Promise<RetryEligibleResult> {
  const session = await requireChurchSession("/app/pastor");
  const role = session.appContext.roleId;
  if (role !== "pastor" && role !== "church-admin" && role !== "secretary") {
    throw new Error(
      "Only pastors and church administrators may retry communications.",
    );
  }

  const churchId = session.appContext.church.id;
  const result = await retryEligibleCommunications({ churchId });

  revalidatePath("/app/communications");

  return result;
}

// ─── CC-COMM-001: Communications Send Lifecycle ──────────────────────────────

function commRoleAllowed(role: string): boolean {
  return role === "church-admin" || role === "secretary" || role === "pastor";
}

function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at);
  if (local.length <= 2) return `${local[0]}***${domain}`;
  return `${local.slice(0, 2)}***${domain}`;
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "***";
  return `***-***-${digits.slice(-4)}`;
}

export async function previewRecipientsAction(
  segment: SegmentFilter,
  channel: CommunicationChannel,
): Promise<{ ok: true; result: RecipientPreviewResult } | { ok: false; error: string }> {
  const session = await requireChurchSession("/app/communications");
  const role = session.appContext.roleId;
  if (!commRoleAllowed(role)) {
    return { ok: false as const, error: "Access denied." };
  }

  const churchId = session.appContext.church.id;

  try {
    const recipients = await resolveRecipients(churchId, channel, segment);
    const sample = recipients.slice(0, 5).map((r) => ({
      profileId: r.profileId,
      name: r.name,
      contact:
        channel === "email" ? maskEmail(r.contact) : maskPhone(r.contact),
    }));

    return {
      ok: true as const,
      result: { count: recipients.length, sample },
    };
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : "Preview failed." };
  }
}

export async function composeAndSendMessageAction(
  input: ComposeMessageInput,
): Promise<{ ok: true; logId: string } | { ok: false; error: string }> {
  const session = await requireChurchSession("/app/communications");
  const role = session.appContext.roleId;
  if (!commRoleAllowed(role)) {
    return { ok: false as const, error: "Access denied." };
  }

  // Validate
  const normalizedBody = input.body.trim();
  if (!normalizedBody) {
    return { ok: false as const, error: "Message body is required." };
  }

  if (input.channel === "email") {
    const subject = input.subject?.trim();
    if (!subject) {
      return { ok: false as const, error: "Email subject is required." };
    }
  }

  if (input.scheduledFor !== null) {
    const parsed = new Date(input.scheduledFor);
    if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) {
      return { ok: false as const, error: "Scheduled send time must be in the future." };
    }
  }

  const churchId = session.appContext.church.id;
  const sentBy = session.profile.id ?? null;

  // Resolve full recipient list
  let recipients: Awaited<ReturnType<typeof resolveRecipients>>;
  try {
    recipients = await resolveRecipients(churchId, input.channel, input.segment);
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : "Recipient resolution failed." };
  }

  if (recipients.length === 0) {
    return { ok: false as const, error: "No contactable recipients match the selected segment." };
  }

  const { createTenantServerClient } = await import("@/lib/supabase/tenant");
  const supabase = await createTenantServerClient();

  const status = input.scheduledFor !== null ? "scheduled" : "queued";

  const insertPayload: Record<string, unknown> = {
    church_id: churchId,
    sent_by: sentBy,
    channel: input.channel,
    subject: input.subject?.trim() ?? null,
    body_preview: normalizedBody.slice(0, 500),
    status,
    segment_criteria: input.segment,
    scheduled_for: input.scheduledFor ?? null,
  };

  const { data: logData, error: logError } = await supabase
    .from("communication_logs")
    .insert(insertPayload)
    .select("id")
    .single();

  if (logError) {
    return { ok: false as const, error: logError.message };
  }

  const logId = (logData as { id: string }).id;

  if (input.scheduledFor === null) {
    // Call sendWithSuppression directly — avoids double-session fetch and the
    // misleading opt-in override that broadcastMessageAction required.
    for (const recipient of recipients) {
      await sendWithSuppression({
        session,
        channel: input.channel,
        recipientProfileId: recipient.profileId,
        recipientContact: recipient.contact,
        subject: input.subject?.trim() ?? undefined,
        body: normalizedBody,
      });
    }
  }

  revalidatePath("/app/communications/history");
  return { ok: true as const, logId };
}

export async function cancelScheduledMessageAction(
  logId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireChurchSession("/app/communications");
  const role = session.appContext.roleId;
  if (!commRoleAllowed(role)) {
    return { ok: false as const, error: "Access denied." };
  }

  const churchId = session.appContext.church.id;
  const { createTenantServerClient } = await import("@/lib/supabase/tenant");
  const supabase = await createTenantServerClient();

  const { data: logData, error: fetchError } = await supabase
    .from("communication_logs")
    .select("id, status, church_id")
    .eq("id", logId)
    .eq("church_id", churchId)
    .maybeSingle();

  if (fetchError) {
    return { ok: false as const, error: fetchError.message };
  }

  if (!logData) {
    return { ok: false as const, error: "Message not found." };
  }

  const log = logData as { id: string; status: string; church_id: string };

  if (log.status !== "scheduled") {
    return { ok: false as const, error: "Only scheduled messages can be cancelled." };
  }

  const { error: updateError } = await supabase
    .from("communication_logs")
    .update({ status: "cancelled" })
    .eq("id", logId)
    .eq("church_id", churchId);

  if (updateError) {
    return { ok: false as const, error: updateError.message };
  }

  revalidatePath("/app/communications/history");
  return { ok: true as const };
}

export async function listCommunicationLogsAction(): Promise<
  { ok: true; logs: CommunicationLogSummary[] } | { ok: false; error: string }
> {
  const session = await requireChurchSession("/app/communications");
  const role = session.appContext.roleId;
  if (!commRoleAllowed(role)) {
    return { ok: false as const, error: "Access denied." };
  }

  const churchId = session.appContext.church.id;
  const { createTenantServerClient } = await import("@/lib/supabase/tenant");
  const supabase = await createTenantServerClient();

  const { data, error } = await supabase
    .from("communication_logs")
    .select(
      `id, channel, subject, body_preview, status, scheduled_for, sent_at,
       created_at, retry_count, segment_criteria,
       profiles!communication_logs_sent_by_fkey(full_name)`,
    )
    .eq("church_id", churchId)
    .order("created_at", { ascending: false });

  if (error) {
    return { ok: false as const, error: error.message };
  }

  const logs: CommunicationLogSummary[] = (data ?? []).map((row) => {
    const profileJoin = (row.profiles as unknown) as { full_name: string | null } | null;
    return {
      id: row.id,
      channel: row.channel as CommunicationChannel,
      subject: row.subject ?? null,
      bodyPreview: row.body_preview ?? "",
      status: row.status,
      scheduledFor: row.scheduled_for ?? null,
      sentAt: row.sent_at ?? null,
      createdAt: row.created_at,
      retryCount: row.retry_count ?? 0,
      segmentCriteria: (row.segment_criteria as SegmentFilter | null) ?? null,
      sentByName: profileJoin?.full_name ?? null,
    };
  });

  return { ok: true as const, logs };
}

export async function getMessageAnalyticsAction(
  logId: string,
): Promise<{ ok: true; analytics: MessageAnalytics } | { ok: false; error: string }> {
  const session = await requireChurchSession("/app/communications");
  const role = session.appContext.roleId;
  if (!commRoleAllowed(role)) {
    return { ok: false as const, error: "Access denied." };
  }

  const churchId = session.appContext.church.id;
  const { createTenantServerClient } = await import("@/lib/supabase/tenant");
  const supabase = await createTenantServerClient();

  // Verify log belongs to this church
  const { data: logData, error: logError } = await supabase
    .from("communication_logs")
    .select("id, channel")
    .eq("id", logId)
    .eq("church_id", churchId)
    .maybeSingle();

  if (logError) {
    return { ok: false as const, error: logError.message };
  }

  if (!logData) {
    return { ok: false as const, error: "Message not found." };
  }

  const logRow = logData as { id: string; channel: string };

  // Aggregate delivery events
  const { data: events, error: eventsError } = await supabase
    .from("communication_delivery_events")
    .select("event_type")
    .eq("communication_log_id", logId)
    .eq("church_id", churchId);

  if (eventsError) {
    return { ok: false as const, error: eventsError.message };
  }

  let sentCount = 0;
  let deliveredCount = 0;
  let bouncedCount = 0;
  let failedCount = 0;
  let openedCount = 0;
  let suppressedCount = 0;

  for (const evt of events ?? []) {
    const t = (evt.event_type as string).toLowerCase();
    if (t === "sent") sentCount++;
    else if (t === "delivered") deliveredCount++;
    else if (t === "bounce" || t === "bounced") bouncedCount++;
    else if (t === "failed") failedCount++;
    else if (t === "open" || t === "opened") openedCount++;
    else if (t === "suppressed") suppressedCount++;
  }

  const openRate =
    logRow.channel === "email" && deliveredCount > 0
      ? openedCount / deliveredCount
      : null;

  return {
    ok: true as const,
    analytics: {
      logId,
      sentCount,
      deliveredCount,
      bouncedCount,
      failedCount,
      openRate,
      suppressedCount,
    },
  };
}

export async function createTemplateAction(input: {
  name: string;
  channel: CommunicationChannel;
  subject: string | null;
  body: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const session = await requireChurchSession("/app/communications");
  const role = session.appContext.roleId;
  if (!commRoleAllowed(role)) {
    return { ok: false as const, error: "Access denied." };
  }

  const churchId = session.appContext.church.id;
  const profileId = session.profile.id ?? null;
  const { createTenantServerClient } = await import("@/lib/supabase/tenant");
  const supabase = await createTenantServerClient();

  const { data, error } = await supabase
    .from("communication_templates")
    .insert({
      church_id: churchId,
      name: input.name,
      channel: input.channel,
      subject: input.subject ?? null,
      body: input.body,
      created_by: profileId,
      updated_by: profileId,
    })
    .select("id")
    .single();

  if (error) {
    return { ok: false as const, error: error.message };
  }

  revalidatePath("/app/communications/templates");
  return { ok: true as const, id: (data as { id: string }).id };
}

export async function updateTemplateAction(input: {
  id: string;
  name: string;
  subject: string | null;
  body: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireChurchSession("/app/communications");
  const role = session.appContext.roleId;
  if (!commRoleAllowed(role)) {
    return { ok: false as const, error: "Access denied." };
  }

  const churchId = session.appContext.church.id;
  const profileId = session.profile.id ?? null;
  const { createTenantServerClient } = await import("@/lib/supabase/tenant");
  const supabase = await createTenantServerClient();

  // Verify ownership
  const { data: tmpl, error: fetchError } = await supabase
    .from("communication_templates")
    .select("id, church_id")
    .eq("id", input.id)
    .eq("church_id", churchId)
    .maybeSingle();

  if (fetchError) {
    return { ok: false as const, error: fetchError.message };
  }

  if (!tmpl) {
    return { ok: false as const, error: "Template not found." };
  }

  // Channel is NOT editable — only update name, subject, body, updated_by
  const { error: updateError } = await supabase
    .from("communication_templates")
    .update({
      name: input.name,
      subject: input.subject ?? null,
      body: input.body,
      updated_by: profileId,
    })
    .eq("id", input.id)
    .eq("church_id", churchId);

  if (updateError) {
    return { ok: false as const, error: updateError.message };
  }

  revalidatePath("/app/communications/templates");
  return { ok: true as const };
}

export async function deleteTemplateAction(input: {
  id: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireChurchSession("/app/communications");
  const role = session.appContext.roleId;
  if (!commRoleAllowed(role)) {
    return { ok: false as const, error: "Access denied." };
  }

  const churchId = session.appContext.church.id;
  const { createTenantServerClient } = await import("@/lib/supabase/tenant");
  const supabase = await createTenantServerClient();

  // Verify ownership before delete
  const { data: tmpl, error: fetchError } = await supabase
    .from("communication_templates")
    .select("id, church_id")
    .eq("id", input.id)
    .eq("church_id", churchId)
    .maybeSingle();

  if (fetchError) {
    return { ok: false as const, error: fetchError.message };
  }

  if (!tmpl) {
    return { ok: false as const, error: "Template not found." };
  }

  const { error: deleteError } = await supabase
    .from("communication_templates")
    .delete()
    .eq("id", input.id)
    .eq("church_id", churchId);

  if (deleteError) {
    return { ok: false as const, error: deleteError.message };
  }

  revalidatePath("/app/communications/templates");
  return { ok: true as const };
}

export async function listTemplatesAction(
  channel?: CommunicationChannel,
): Promise<{ ok: true; templates: CommunicationTemplate[] } | { ok: false; error: string }> {
  const session = await requireChurchSession("/app/communications");
  const role = session.appContext.roleId;
  if (!commRoleAllowed(role)) {
    return { ok: false as const, error: "Access denied." };
  }

  const churchId = session.appContext.church.id;
  const { createTenantServerClient } = await import("@/lib/supabase/tenant");
  const supabase = await createTenantServerClient();

  let query = supabase
    .from("communication_templates")
    .select("id, church_id, name, channel, subject, body, created_by, updated_by, created_at, updated_at")
    .eq("church_id", churchId);

  if (channel) {
    query = query.eq("channel", channel);
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) {
    return { ok: false as const, error: error.message };
  }

  const templates: CommunicationTemplate[] = (data ?? []).map((row) => ({
    id: row.id,
    churchId: row.church_id,
    name: row.name,
    channel: row.channel as CommunicationChannel,
    subject: row.subject ?? null,
    body: row.body,
    createdBy: row.created_by ?? null,
    updatedBy: row.updated_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

  return { ok: true as const, templates };
}
