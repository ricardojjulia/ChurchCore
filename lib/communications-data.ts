import "server-only";

import {
  createTenantServerClient,
  hasTenantBackendEnv,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";
import type { ChurchAppSession } from "@/lib/auth";

export type CommunicationLogEntry = {
  id: string;
  sentByName: string | null;
  recipientName: string | null;
  channel: "email" | "sms" | "push" | "in_app";
  subject: string | null;
  bodyPreview: string | null;
  status:
    | "draft"
    | "queued"
    | "scheduled"
    | "sending"
    | "sent"
    | "delivered"
    | "failed"
    | "bounced"
    | "suppressed"
    | "unsubscribed"
    | "cancelled";
  scheduledFor: string | null;
  sentAt: string | null;
  createdAt: string;
  retryCount: number;
  errorCode: string | null;
};

export type CommunicationDeliveryEvent = {
  id: string;
  communicationLogId: string | null;
  provider: "sendgrid" | "twilio" | "resend";
  channel: "email" | "sms";
  eventType: string;
  status: CommunicationLogEntry["status"];
  providerEventId: string | null;
  providerMessageId: string | null;
  recipientContact: string | null;
  reason: string | null;
  occurredAt: string;
  createdAt: string;
};

export type CommunicationSuppression = {
  id: string;
  channel: "email" | "sms";
  contact: string;
  reason: "manual" | "unsubscribe" | "bounce" | "complaint";
  notes: string | null;
  suppressedByName: string | null;
  createdAt: string;
};

export type CommunicationRecipient = {
  profileId: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  ministries: string[];
  emailOptIn: boolean;
  smsOptIn: boolean;
};

export type CommunicationsHubData = {
  recentLogs: CommunicationLogEntry[];
  recipients: CommunicationRecipient[];
  deliveryEvents: CommunicationDeliveryEvent[];
  suppressions: CommunicationSuppression[];
};

const EMPTY_COMMUNICATIONS_HUB_DATA: CommunicationsHubData = {
  recentLogs: [],
  recipients: [],
  deliveryEvents: [],
  suppressions: [],
};

export async function getCommunicationsHubData(
  session: ChurchAppSession,
): Promise<CommunicationsHubData> {
  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    return EMPTY_COMMUNICATIONS_HUB_DATA;
  }

  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    const [logs, recipients, suppressions] = await Promise.all([
      queryTenantLocalDb<{
        id: string;
        sent_by_name: string | null;
        recipient_name: string | null;
        channel: string;
        subject: string | null;
        body_preview: string | null;
        status: string;
        scheduled_for: string | null;
        sent_at: string | null;
        created_at: string;
        retry_count: number | null;
        error_code: string | null;
      }>(
        `select
           cl.id,
           sb.full_name as sent_by_name,
           rp.full_name as recipient_name,
           cl.channel,
           cl.subject,
           cl.body_preview,
           cl.status,
           cl.scheduled_for,
           cl.sent_at,
           cl.created_at,
           cl.retry_count,
           cl.error_code
         from public.communication_logs cl
         left join public.profiles sb on sb.id = cl.sent_by
         left join public.profiles rp on rp.id = cl.recipient_id
         where cl.church_id = $1
         order by cl.created_at desc
         limit 50`,
        [churchId],
      ),
      queryTenantLocalDb<{
        profile_id: string;
        name: string;
        email: string | null;
        phone: string | null;
        role: string;
        ministry_names: string;
        email_opt_in: boolean;
        sms_opt_in: boolean;
      }>(
        `select
           p.id                    as profile_id,
           p.full_name             as name,
           p.email,
           p.phone,
           cm.role,
           coalesce(
             string_agg(distinct m.name, ', ' order by m.name), ''
           )                       as ministry_names,
           coalesce(np.email_opt_in, true)  as email_opt_in,
           coalesce(np.sms_opt_in,  false) as sms_opt_in
         from public.profiles p
         join public.church_memberships cm
           on cm.user_id = p.id and cm.church_id = $1
         left join public.profile_ministries pm
           on pm.profile_id = p.id
         left join public.ministries m
           on m.id = pm.ministry_id and m.church_id = $1
         left join public.notification_preferences np
           on np.profile_id = p.id and np.church_id = $1
         where p.merged_into_profile_id is null
         group by p.id, p.full_name, p.email, p.phone, cm.role,
                  np.email_opt_in, np.sms_opt_in
         order by p.full_name`,
        [churchId],
      ),
      queryTenantLocalDb<{
        id: string;
        channel: "email" | "sms";
        contact: string;
        reason: "manual" | "unsubscribe" | "bounce" | "complaint";
        notes: string | null;
        suppressed_by_name: string | null;
        created_at: string;
      }>(
        `select
           suppression.id,
           suppression.channel,
           suppression.contact,
           suppression.reason,
           suppression.notes,
           profile.full_name as suppressed_by_name,
           suppression.created_at
         from public.communication_suppressions suppression
         left join public.profiles profile
           on profile.id = suppression.suppressed_by
         where suppression.church_id = $1
         order by suppression.created_at desc
         limit 100`,
        [churchId],
      ).catch(() => ({ rows: [] })),
    ]);

    return {
      recentLogs: logs.rows.map((r) => ({
        id: r.id,
        sentByName: r.sent_by_name,
        recipientName: r.recipient_name,
        channel: r.channel as CommunicationLogEntry["channel"],
        subject: r.subject,
        bodyPreview: r.body_preview,
        status: r.status as CommunicationLogEntry["status"],
        scheduledFor: r.scheduled_for,
        sentAt: r.sent_at,
        createdAt: r.created_at,
        retryCount: r.retry_count ?? 0,
        errorCode: r.error_code,
      })),
      recipients: recipients.rows.map((r) => ({
        profileId: r.profile_id,
        name: r.name ?? "(unnamed)",
        email: r.email,
        phone: r.phone,
        role: r.role,
        ministries: r.ministry_names ? r.ministry_names.split(", ") : [],
        emailOptIn: r.email_opt_in,
        smsOptIn: r.sms_opt_in,
      })),
      deliveryEvents: [],
      suppressions: suppressions.rows.map((row) => ({
        id: row.id,
        channel: row.channel,
        contact: row.contact,
        reason: row.reason,
        notes: row.notes,
        suppressedByName: row.suppressed_by_name,
        createdAt: row.created_at,
      })),
    };
  }

  const supabase = await createTenantServerClient();

  const [{ data: logs }, { data: members }, suppressions] = await Promise.all([
    supabase
      .from("communication_logs")
      .select(
        "id, channel, subject, body_preview, status, scheduled_for, sent_at, created_at, retry_count, error_code, sent_by:profiles!sent_by(full_name), recipient:profiles!recipient_id(full_name)",
      )
      .eq("church_id", churchId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("church_memberships")
      .select(
        "role, profile:profiles(id, full_name, email, phone, profile_ministries(ministries(name)), notification_preferences(email_opt_in, sms_opt_in))",
      )
      .eq("church_id", churchId),
    (async () => {
      try {
        const result = await supabase
          .from("communication_suppressions")
          .select("id, channel, contact, reason, notes, created_at, profile:profiles!suppressed_by(full_name)")
          .eq("church_id", churchId)
          .order("created_at", { ascending: false })
          .limit(100);

        return { data: result.data ?? [] };
      } catch {
        return { data: [] as Array<Record<string, unknown>> };
      }
    })(),
  ]);

  return {
    recentLogs: (logs ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      return {
        id: r.id as string,
        sentByName:
          (r.sent_by as { full_name?: string } | null)?.full_name ?? null,
        recipientName:
          (r.recipient as { full_name?: string } | null)?.full_name ?? null,
        channel: r.channel as CommunicationLogEntry["channel"],
        subject: r.subject as string | null,
        bodyPreview: r.body_preview as string | null,
        status: r.status as CommunicationLogEntry["status"],
        scheduledFor: r.scheduled_for as string | null,
        sentAt: r.sent_at as string | null,
        createdAt: r.created_at as string,
        retryCount: Number(r.retry_count ?? 0),
        errorCode: (r.error_code as string | null) ?? null,
      };
    }),
    recipients: (members ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      const profile = r.profile as Record<string, unknown> | null;
      const prefs = (
        profile?.notification_preferences as
          | Array<{ email_opt_in?: boolean; sms_opt_in?: boolean }>
          | null
      )?.[0];
      const ministryRows = (
        profile?.profile_ministries as
          | Array<{ ministries?: { name?: string } | null }>
          | null
      ) ?? [];
      return {
        profileId: profile?.id as string,
        name: (profile?.full_name as string | null) ?? "(unnamed)",
        email: (profile?.email as string | null) ?? null,
        phone: (profile?.phone as string | null) ?? null,
        role: r.role as string,
        ministries: ministryRows
          .map((pm) => pm.ministries?.name ?? "")
          .filter(Boolean),
        emailOptIn: prefs?.email_opt_in ?? true,
        smsOptIn: prefs?.sms_opt_in ?? false,
      };
    }),
    deliveryEvents: [],
    suppressions: (suppressions.data ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      return {
        id: String(r.id),
        channel: r.channel as CommunicationSuppression["channel"],
        contact: String(r.contact ?? ""),
        reason: r.reason as CommunicationSuppression["reason"],
        notes: (r.notes as string | null) ?? null,
        suppressedByName:
          ((r.profile as { full_name?: string } | null)?.full_name as string | undefined) ?? null,
        createdAt: String(r.created_at),
      };
    }),
  };
}

export async function getCommunicationDeliveryEvents(
  session: ChurchAppSession,
  logId: string,
): Promise<CommunicationDeliveryEvent[]> {
  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    return [];
  }

  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    try {
      const result = await queryTenantLocalDb<{
        id: string;
        communication_log_id: string | null;
        provider: "sendgrid" | "twilio" | "resend";
        channel: "email" | "sms";
        event_type: string;
        status: CommunicationLogEntry["status"];
        provider_event_id: string | null;
        provider_message_id: string | null;
        recipient_contact: string | null;
        reason: string | null;
        occurred_at: string;
        created_at: string;
      }>(
        `
          select
            id,
            communication_log_id,
            provider,
            channel,
            event_type,
            status,
            provider_event_id,
            provider_message_id,
            recipient_contact,
            reason,
            occurred_at,
            created_at
          from public.communication_delivery_events
          where church_id = $1
            and communication_log_id = $2
          order by occurred_at desc
        `,
        [churchId, logId],
      );

      return result.rows.map((row) => ({
        id: row.id,
        communicationLogId: row.communication_log_id,
        provider: row.provider,
        channel: row.channel,
        eventType: row.event_type,
        status: row.status,
        providerEventId: row.provider_event_id,
        providerMessageId: row.provider_message_id,
        recipientContact: row.recipient_contact,
        reason: row.reason,
        occurredAt: row.occurred_at,
        createdAt: row.created_at,
      }));
    } catch {
      return [];
    }
  }

  const supabase = await createTenantServerClient();
  const { data, error } = await supabase
    .from("communication_delivery_events")
    .select(
      "id, communication_log_id, provider, channel, event_type, status, provider_event_id, provider_message_id, recipient_contact, reason, occurred_at, created_at",
    )
    .eq("church_id", churchId)
    .eq("communication_log_id", logId)
    .order("occurred_at", { ascending: false });

  if (error) {
    return [];
  }

  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id),
      communicationLogId: (r.communication_log_id as string | null) ?? null,
      provider: r.provider as CommunicationDeliveryEvent["provider"],
      channel: r.channel as CommunicationDeliveryEvent["channel"],
      eventType: String(r.event_type),
      status: r.status as CommunicationDeliveryEvent["status"],
      providerEventId: (r.provider_event_id as string | null) ?? null,
      providerMessageId: (r.provider_message_id as string | null) ?? null,
      recipientContact: (r.recipient_contact as string | null) ?? null,
      reason: (r.reason as string | null) ?? null,
      occurredAt: String(r.occurred_at),
      createdAt: String(r.created_at),
    };
  });
}

export async function getCommunicationSuppressions(
  session: ChurchAppSession,
): Promise<CommunicationSuppression[]> {
  return (await getCommunicationsHubData(session)).suppressions;
}
