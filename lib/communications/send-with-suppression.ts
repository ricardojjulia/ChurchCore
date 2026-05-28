import type { ChurchAppSession } from "@/lib/auth";
import {
  createTenantServerClient,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";
import {
  type QueueCommunicationResult,
  queueCommunicationAction,
} from "@/lib/notifications/queue-communication";

export type SuppressionChannel = "email" | "sms";

export type SendWithSuppressionInput = {
  session: ChurchAppSession;
  recipientProfileId: string | null;
  recipientContact: string;
  channel: SuppressionChannel;
  subject?: string;
  body: string;
  html?: string;
  scheduledFor?: string;
  retryCount?: number;
};

type SuppressionMatch = {
  reason: "manual" | "unsubscribe" | "bounce" | "complaint";
};

async function findSuppression(
  churchId: string,
  channel: SuppressionChannel,
  contact: string,
): Promise<SuppressionMatch | null> {
  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{ reason: SuppressionMatch["reason"] }>(
      `
        select reason
        from public.communication_suppressions
        where church_id = $1
          and channel = $2
          and lower(contact) = lower($3)
        limit 1
      `,
      [churchId, channel, contact],
    );

    return result.rows[0] ?? null;
  }

  const supabase = await createTenantServerClient();
  const { data, error } = await supabase
    .from("communication_suppressions")
    .select("reason")
    .eq("church_id", churchId)
    .eq("channel", channel)
    .ilike("contact", contact)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as SuppressionMatch | null) ?? null;
}

async function writeSuppressedLog(input: {
  session: ChurchAppSession;
  recipientProfileId: string | null;
  recipientContact: string;
  channel: SuppressionChannel;
  subject?: string;
  body: string;
  reason: SuppressionMatch["reason"];
}): Promise<string | undefined> {
  const churchId = input.session.appContext.church.id;
  const sentBy = input.session.profile.id ?? null;

  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{ id: string }>(
      `
        insert into public.communication_logs
          (church_id, sent_by, recipient_id, channel, subject, body_preview, status,
           suppression_reason, suppressed_at, error_message)
        values ($1, $2, $3, $4, $5, $6, 'suppressed', $7, now(), $8)
        returning id
      `,
      [
        churchId,
        sentBy,
        input.recipientProfileId,
        input.channel,
        input.subject ?? null,
        input.body.slice(0, 500),
        input.reason,
        `Suppressed ${input.channel} send for ${input.recipientContact}`,
      ],
    );

    return result.rows[0]?.id;
  }

  const supabase = await createTenantServerClient();
  const { data, error } = await supabase
    .from("communication_logs")
    .insert({
      church_id: churchId,
      sent_by: sentBy,
      recipient_id: input.recipientProfileId,
      channel: input.channel,
      subject: input.subject,
      body_preview: input.body.slice(0, 500),
      status: "suppressed",
      suppression_reason: input.reason,
      suppressed_at: new Date().toISOString(),
      error_message: `Suppressed ${input.channel} send for ${input.recipientContact}`,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return (data as { id?: string } | null)?.id;
}

export async function sendWithSuppression(
  input: SendWithSuppressionInput,
): Promise<QueueCommunicationResult> {
  const suppression = await findSuppression(
    input.session.appContext.church.id,
    input.channel,
    input.recipientContact,
  );

  if (suppression) {
    const logId = await writeSuppressedLog({
      session: input.session,
      recipientProfileId: input.recipientProfileId,
      recipientContact: input.recipientContact,
      channel: input.channel,
      subject: input.subject,
      body: input.body,
      reason: suppression.reason,
    });

    return {
      sent: false,
      skipped: true,
      skipReason: `Recipient is suppressed for ${input.channel} (${suppression.reason}).`,
      logId,
    };
  }

  return queueCommunicationAction({
    session: input.session,
    recipientProfileId: input.recipientProfileId,
    recipientContact: input.recipientContact,
    channel: input.channel,
    subject: input.subject,
    body: input.body,
    html: input.html,
    scheduledFor: input.scheduledFor,
    retryCount: input.retryCount,
  });
}
