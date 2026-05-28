import {
  buildProviderWebhookIdempotencyKey,
  type NormalizedProviderWebhookEvent,
} from "@/lib/communications/provider-adapter";
import {
  createTenantServerClient,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";

type ResolvedLog = {
  id: string;
  church_id: string;
};

async function resolveCommunicationLog(
  providerMessageId?: string,
): Promise<ResolvedLog | null> {
  if (!providerMessageId) {
    return null;
  }

  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<ResolvedLog>(
      `
        select id, church_id
        from public.communication_logs
        where provider_message_id = $1
           or external_id = $1
        order by created_at desc
        limit 1
      `,
      [providerMessageId],
    );

    return result.rows[0] ?? null;
  }

  const supabase = await createTenantServerClient();
  const { data, error } = await supabase
    .from("communication_logs")
    .select("id, church_id")
    .or(`provider_message_id.eq.${providerMessageId},external_id.eq.${providerMessageId}`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as ResolvedLog | null) ?? null;
}

export async function recordProviderWebhookEvent(input: {
  event: NormalizedProviderWebhookEvent;
  rawBody: string;
}): Promise<{ recorded: boolean; churchId?: string; communicationLogId?: string }> {
  const resolvedLog = await resolveCommunicationLog(input.event.providerMessageId);
  if (!resolvedLog) {
    return { recorded: false };
  }

  const idempotencyKey = buildProviderWebhookIdempotencyKey({
    provider: input.event.provider,
    eventId: input.event.eventId,
    occurredAtIso: input.event.occurredAtIso,
  });

  if (shouldUseLocalTenantFallback()) {
    const inserted = await queryTenantLocalDb<{ id: string }>(
      `
        insert into public.communication_delivery_events
          (church_id, communication_log_id, provider, channel, event_type, status,
           provider_event_id, provider_message_id, recipient_contact, reason,
           idempotency_key, raw_payload, occurred_at)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13)
        on conflict (idempotency_key) do nothing
        returning id
      `,
      [
        resolvedLog.church_id,
        resolvedLog.id,
        input.event.provider,
        input.event.channel,
        input.event.eventId,
        input.event.status,
        input.event.eventId,
        input.event.providerMessageId ?? null,
        input.event.recipient ?? null,
        input.event.reason ?? null,
        idempotencyKey,
        input.rawBody,
        input.event.occurredAtIso,
      ],
    );

    if (!inserted.rows[0]) {
      return { recorded: false, churchId: resolvedLog.church_id, communicationLogId: resolvedLog.id };
    }

    await queryTenantLocalDb(
      `
        update public.communication_logs
        set status = $3,
            delivered_at = case when $3 = 'delivered' then coalesce(delivered_at, $4::timestamptz) else delivered_at end,
            failed_at = case when $3 in ('failed','bounced') then coalesce(failed_at, $4::timestamptz) else failed_at end,
            error_message = case when $5 is null then error_message else $5 end,
            error_code = case when $3 in ('failed','bounced') then coalesce(error_code, 'provider_event') else error_code end
        where church_id = $1
          and id = $2
      `,
      [
        resolvedLog.church_id,
        resolvedLog.id,
        input.event.status,
        input.event.occurredAtIso,
        input.event.reason ?? null,
      ],
    );

    return { recorded: true, churchId: resolvedLog.church_id, communicationLogId: resolvedLog.id };
  }

  const supabase = await createTenantServerClient();

  const { data: inserted, error: insertError } = await supabase
    .from("communication_delivery_events")
    .insert({
      church_id: resolvedLog.church_id,
      communication_log_id: resolvedLog.id,
      provider: input.event.provider,
      channel: input.event.channel,
      event_type: input.event.eventId,
      status: input.event.status,
      provider_event_id: input.event.eventId,
      provider_message_id: input.event.providerMessageId,
      recipient_contact: input.event.recipient,
      reason: input.event.reason,
      idempotency_key: idempotencyKey,
      raw_payload: JSON.parse(input.rawBody),
      occurred_at: input.event.occurredAtIso,
    })
    .select("id")
    .maybeSingle();

  if (insertError) {
    if (insertError.code === "23505") {
      return { recorded: false, churchId: resolvedLog.church_id, communicationLogId: resolvedLog.id };
    }
    throw new Error(insertError.message);
  }

  if (!inserted) {
    return { recorded: false, churchId: resolvedLog.church_id, communicationLogId: resolvedLog.id };
  }

  const updatePayload: Record<string, unknown> = {
    status: input.event.status,
  };

  if (input.event.status === "delivered") {
    updatePayload.delivered_at = input.event.occurredAtIso;
  }

  if (input.event.status === "failed" || input.event.status === "bounced") {
    updatePayload.failed_at = input.event.occurredAtIso;
    updatePayload.error_code = "provider_event";
  }

  if (input.event.reason) {
    updatePayload.error_message = input.event.reason;
  }

  const { error: updateError } = await supabase
    .from("communication_logs")
    .update(updatePayload)
    .eq("church_id", resolvedLog.church_id)
    .eq("id", resolvedLog.id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  return { recorded: true, churchId: resolvedLog.church_id, communicationLogId: resolvedLog.id };
}
