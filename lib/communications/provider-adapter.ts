export type CommunicationProvider = "sendgrid" | "resend" | "twilio";

export type CommunicationProviderChannel = "email" | "sms";

export type CommunicationDeliveryStatus =
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

/**
 * The error code an adapter returns when its keys are missing where stubs
 * aren't allowed (production). Not transient, so the retry cron skips it.
 */
export const PROVIDER_NOT_CONFIGURED = "provider_not_configured";

export type ProviderSendPayload = {
  to: string;
  subject?: string;
  body: string;
  html?: string;
  metadata?: Record<string, string>;
};

export type ProviderSendResult = {
  accepted: boolean;
  providerMessageId?: string;
  errorCode?: string;
  errorMessage?: string;
};

export type NormalizedProviderWebhookEvent = {
  provider: CommunicationProvider;
  channel: CommunicationProviderChannel;
  eventId: string;
  providerMessageId?: string;
  status: CommunicationDeliveryStatus;
  occurredAtIso: string;
  recipient?: string;
  reason?: string;
};

export type ProviderAdapter = {
  provider: CommunicationProvider;
  channel: CommunicationProviderChannel;
  send(payload: ProviderSendPayload): Promise<ProviderSendResult>;
  /**
   * True only for a request the provider provably signed. Fails closed: an
   * unset secret rejects every request, in every environment (S2).
   * `requestUrl` is the public URL the provider called (Twilio signs it).
   */
  verifyWebhookSignature(
    rawBody: string,
    headers: Record<string, string>,
    requestUrl?: string | null,
  ): boolean;
  normalizeWebhookEvent(
    rawBody: string,
    headers: Record<string, string>,
  ): NormalizedProviderWebhookEvent | null;
};

const TRANSIENT_PROVIDER_ERROR_CODES = new Set([
  "timeout",
  "rate_limited",
  "provider_unavailable",
  "network_error",
  "temporary_failure",
]);

export function shouldRetryDelivery(
  status: CommunicationDeliveryStatus,
  errorCode?: string,
): boolean {
  if (status !== "failed") {
    return false;
  }

  if (!errorCode) {
    return false;
  }

  return TRANSIENT_PROVIDER_ERROR_CODES.has(errorCode);
}

export function buildProviderWebhookIdempotencyKey(
  event: Pick<NormalizedProviderWebhookEvent, "provider" | "eventId" | "occurredAtIso">,
): string {
  return `${event.provider}:${event.eventId}:${event.occurredAtIso}`;
}
