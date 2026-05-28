"use server";

import { revalidatePath } from "next/cache";

import { requireChurchSession } from "@/lib/auth";
import {
  type CommunicationDeliveryEvent,
  type CommunicationRecipient,
  getCommunicationDeliveryEvents,
} from "@/lib/communications-data";
import { shouldRetryDelivery } from "@/lib/communications/provider-adapter";
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
  if (role !== "pastor" && role !== "church-admin") {
    throw new Error("Only pastors and church administrators may send communications.");
  }

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
      subject: input.subject,
      body: input.body,
      scheduledFor: input.scheduledFor,
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
  if (role !== "pastor" && role !== "church-admin") {
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
  if (role !== "pastor" && role !== "church-admin") {
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
    revalidatePath("/app/member");
    return;
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
