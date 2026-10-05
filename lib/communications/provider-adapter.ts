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
  /**
   * Stable id for this send. Resend takes it as `Idempotency-Key` (1-256
   * characters, deduplicated for 24 hours). SendGrid has no such header, so
   * its adapter ignores it.
   */
  idempotencyKey?: string;
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
  /**
   * True when the provider sent no event time, so occurredAtIso is when we
   * received it. Such events are deduplicated on eventId alone: a provider
   * retry must not look like a new event (PR #166 review).
   */
  occurredAtIsReceiptTime?: boolean;
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

/**
 * The one list of error codes the retry cron treats as transient. The cron's
 * query (`retry-eligible.ts`) and `shouldRetryDelivery` both read it, so they
 * cannot drift apart.
 */
export const TRANSIENT_PROVIDER_ERROR_CODES: readonly string[] = [
  "timeout",
  "rate_limited",
  "provider_unavailable",
  "network_error",
  "temporary_failure",
];

/** Non-transient codes an email provider's refusal maps to. */
export const PROVIDER_ERROR_CODES = {
  invalidRequest: "invalid_request",
  authError: "provider_auth_error",
  configError: "provider_config_error",
} as const;

/** How long an email provider call may take before it counts as a timeout. */
export const PROVIDER_REQUEST_TIMEOUT_MS = 15_000;

/**
 * Maps a provider's HTTP failure to the shared error codes. `providerType` is
 * the provider's own error type when known (Resend's `invalid_idempotent_request`).
 */
export function mapProviderHttpError(status: number, providerType?: string): string {
  if (status === 429) return "rate_limited";
  if (status === 408) return "timeout";
  if (status === 409) {
    // The same key with a different payload can never succeed on retry.
    return providerType === "invalid_idempotent_request"
      ? PROVIDER_ERROR_CODES.invalidRequest
      : "temporary_failure";
  }
  if (status === 401 || status === 403) return PROVIDER_ERROR_CODES.authError;
  if (status === 404 || status === 405) return PROVIDER_ERROR_CODES.configError;
  if (status >= 500) return "provider_unavailable";
  return PROVIDER_ERROR_CODES.invalidRequest;
}

/** Maps a thrown fetch error: a timeout is `timeout`, anything else `network_error`. */
export function mapProviderFetchError(err: unknown): { errorCode: string; errorMessage: string } {
  const name = err instanceof Error ? err.name : "";
  const message = err instanceof Error ? err.message : String(err);
  return {
    errorCode: name === "TimeoutError" ? "timeout" : "network_error",
    errorMessage: message,
  };
}

const MAX_PROVIDER_MESSAGE_LENGTH = 300;

/**
 * Pulls the provider's own error type and message out of a response body for
 * logs. Resend: `{ name | type, message }`; SendGrid: `{ errors: [{ message }] }`.
 * Never echoes the request, so no recipient or content is added.
 */
export function readProviderError(
  bodyText: string,
  status: number,
  label: string,
): { type?: string; message: string } {
  let type: string | undefined;
  let detail = "";
  try {
    const json = JSON.parse(bodyText) as Record<string, unknown>;
    const rawType = json.name ?? json.type;
    if (typeof rawType === "string") type = rawType;
    if (typeof json.message === "string") detail = json.message;
    else if (Array.isArray(json.errors) && json.errors[0] && typeof (json.errors[0] as { message?: unknown }).message === "string") {
      detail = (json.errors[0] as { message: string }).message;
    }
  } catch {
    // Not JSON: keep the status alone rather than echo an arbitrary body.
  }
  const message = `${label} ${status}${type ? ` (${type})` : ""}${detail ? `: ${detail}` : ""}`;
  return { type, message: message.slice(0, MAX_PROVIDER_MESSAGE_LENGTH) };
}

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

  return TRANSIENT_PROVIDER_ERROR_CODES.includes(errorCode);
}

export function buildProviderWebhookIdempotencyKey(
  event: Pick<NormalizedProviderWebhookEvent, "provider" | "eventId" | "occurredAtIso" | "occurredAtIsReceiptTime">,
): string {
  return event.occurredAtIsReceiptTime
    ? `${event.provider}:${event.eventId}`
    : `${event.provider}:${event.eventId}:${event.occurredAtIso}`;
}
