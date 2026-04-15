import "server-only";

import {
  createTenantServerClient,
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
  status: "queued" | "sent" | "delivered" | "failed" | "bounced";
  scheduledFor: string | null;
  sentAt: string | null;
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
};

export async function getCommunicationsHubData(
  session: ChurchAppSession,
): Promise<CommunicationsHubData> {
  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    const [logs, recipients] = await Promise.all([
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
           cl.created_at
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
           on cm.profile_id = p.id and cm.church_id = $1
         left join public.profile_ministries pm
           on pm.profile_id = p.id
         left join public.ministries m
           on m.id = pm.ministry_id and m.church_id = $1
         left join public.notification_preferences np
           on np.profile_id = p.id and np.church_id = $1
         where p.is_merged_away is not true
         group by p.id, p.full_name, p.email, p.phone, cm.role,
                  np.email_opt_in, np.sms_opt_in
         order by p.full_name`,
        [churchId],
      ),
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
    };
  }

  const supabase = await createTenantServerClient();

  const [{ data: logs }, { data: members }] = await Promise.all([
    supabase
      .from("communication_logs")
      .select(
        "id, channel, subject, body_preview, status, scheduled_for, sent_at, created_at, sent_by:profiles!sent_by(full_name), recipient:profiles!recipient_id(full_name)",
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
  };
}
