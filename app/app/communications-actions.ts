"use server";

import { revalidatePath } from "next/cache";

import { requireChurchSession } from "@/lib/auth";
import { insertConsentLogEntries } from "@/lib/consent-log";
import { queueCommunicationAction } from "@/lib/notifications/queue-communication";
import type { CommunicationRecipient } from "@/lib/communications-data";
import { hasTenantBackendEnv } from "@/lib/supabase/tenant";

export interface BroadcastMessageInput {
  recipientIds: string[];
  channel: "email" | "sms";
  subject?: string;
  body: string;
  /** ISO datetime — if set, logs as queued instead of sending immediately. */
  scheduledFor?: string;
}

/**
 * broadcastMessageAction
 *
 * Sends a message to one or more recipients.
 * Each recipient is checked for consent individually.
 * Only pastors and church-admin roles may call this action.
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
    const contact =
      input.channel === "email" ? recipient.email : recipient.phone;

    if (!contact) {
      skipped++;
      continue;
    }

    const result = await queueCommunicationAction({
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

export interface UpdateNotificationPreferencesInput {
  profileId: string;
  emailOptIn: boolean;
  smsOptIn: boolean;
  pushOptIn: boolean;
  inAppOptIn: boolean;
}

/**
 * updateNotificationPreferencesAction
 *
 * Upserts the notification_preferences row for the calling member.
 * Members update their own prefs; pastors/admins may update any.
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
