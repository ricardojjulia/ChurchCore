import { createHmac, timingSafeEqual } from "node:crypto";

import type {
  NormalizedProviderWebhookEvent,
  ProviderAdapter,
  ProviderSendPayload,
  ProviderSendResult,
} from "@/lib/communications/provider-adapter";

function buildHmac(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

function parseJson(rawBody: string): unknown {
  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    return null;
  }
}

function normalizeSendgridEvent(
  event: Record<string, unknown>,
): NormalizedProviderWebhookEvent | null {
  const eventName = String(event.event ?? "").toLowerCase();
  const timestamp = Number(event.timestamp ?? 0);
  const occurredAtIso = timestamp > 0 ? new Date(timestamp * 1000).toISOString() : new Date().toISOString();
  const eventId =
    (typeof event.sg_event_id === "string" && event.sg_event_id) ||
    (typeof event.sg_message_id === "string" && event.sg_message_id) ||
    `${eventName}:${occurredAtIso}`;

  const statusMap: Record<string, NormalizedProviderWebhookEvent["status"]> = {
    processed: "sent",
    deferred: "sending",
    delivered: "delivered",
    open: "sent",
    click: "sent",
    bounce: "bounced",
    dropped: "suppressed",
    spamreport: "unsubscribed",
    unsubscribe: "unsubscribed",
    group_unsubscribe: "unsubscribed",
  };

  const status = statusMap[eventName] ?? "failed";

  return {
    provider: "sendgrid",
    channel: "email",
    eventId,
    providerMessageId: typeof event.sg_message_id === "string" ? event.sg_message_id : undefined,
    status,
    occurredAtIso,
    recipient: typeof event.email === "string" ? event.email : undefined,
    reason: typeof event.reason === "string" ? event.reason : undefined,
  };
}

export const sendgridAdapter: ProviderAdapter = {
  provider: "sendgrid",
  channel: "email",
  async send(payload: ProviderSendPayload): Promise<ProviderSendResult> {
    const apiKey = process.env.SENDGRID_API_KEY;
    const fromEmail = process.env.SENDGRID_FROM_EMAIL;

    if (!apiKey || !fromEmail) {
      return {
        accepted: true,
        providerMessageId: `sendgrid-stub-${Date.now()}`,
      };
    }

    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: payload.to }] }],
        from: { email: fromEmail },
        subject: payload.subject ?? "(no subject)",
        content: [
          { type: "text/plain", value: payload.body },
          ...(payload.html ? [{ type: "text/html", value: payload.html }] : []),
        ],
        custom_args: payload.metadata,
      }),
    });

    if (response.ok) {
      return {
        accepted: true,
        providerMessageId: response.headers.get("x-message-id") ?? undefined,
      };
    }

    const text = await response.text().catch(() => "");
    return {
      accepted: false,
      errorCode: `sendgrid_${response.status}`,
      errorMessage: text || `SendGrid request failed (${response.status})`,
    };
  },

  verifyWebhookSignature(rawBody: string, headers: Record<string, string>): boolean {
    const verificationKey = process.env.SENDGRID_WEBHOOK_VERIFICATION_KEY;
    if (!verificationKey) {
      return true;
    }

    const signature =
      headers["x-sendgrid-signature"] ??
      headers["x-twilio-email-event-webhook-signature"] ??
      "";
    const timestamp =
      headers["x-sendgrid-timestamp"] ??
      headers["x-twilio-email-event-webhook-timestamp"] ??
      "";

    if (!signature || !timestamp) {
      return false;
    }

    const signedPayload = `${timestamp}.${rawBody}`;
    const expected = buildHmac(signedPayload, verificationKey);

    try {
      return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
    } catch {
      return false;
    }
  },

  normalizeWebhookEvent(
    rawBody: string,
    _headers: Record<string, string>,
  ): NormalizedProviderWebhookEvent | null {
    void _headers;
    const payload = parseJson(rawBody);

    if (!Array.isArray(payload) || payload.length === 0) {
      return null;
    }

    const [first] = payload;
    if (!first || typeof first !== "object") {
      return null;
    }

    return normalizeSendgridEvent(first as Record<string, unknown>);
  },
};
