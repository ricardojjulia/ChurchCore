"use server";

import { revalidatePath } from "next/cache";

import { requireChurchSession } from "@/lib/auth";
import { queueCommunicationAction } from "@/lib/notifications/queue-communication";
import type { CommunicationRecipient } from "@/lib/communications-data";

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
  const session = await requireChurchSession("/app/pastor");
  const churchId = session.appContext.church.id;
  const callerProfileId = session.profile.id;

  const isSelf = callerProfileId === input.profileId;
  const isManager =
    session.appContext.roleId === "pastor" ||
    session.appContext.roleId === "church-admin";

  if (!isSelf && !isManager) {
    throw new Error("You may only update your own notification preferences.");
  }

  const {
    queryTenantLocalDb,
    shouldUseLocalTenantFallback,
    createTenantServerClient,
  } = await import("@/lib/supabase/tenant");

  if (shouldUseLocalTenantFallback()) {
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
  } else {
    const supabase = await createTenantServerClient();
    await supabase.from("notification_preferences").upsert({
      church_id: churchId,
      profile_id: input.profileId,
      email_opt_in: input.emailOptIn,
      sms_opt_in: input.smsOptIn,
      push_opt_in: input.pushOptIn,
      in_app_opt_in: input.inAppOptIn,
      updated_at: new Date().toISOString(),
    });
  }

  revalidatePath("/app/communications");
}
