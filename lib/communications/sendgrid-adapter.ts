import { createPublicKey, verify, type KeyObject } from "node:crypto";

import type {
  NormalizedProviderWebhookEvent,
  ProviderAdapter,
  ProviderSendPayload,
  ProviderSendResult,
} from "@/lib/communications/provider-adapter";
import { stubsAllowed } from "@/lib/stub-mode";
import { PROVIDER_NOT_CONFIGURED } from "@/lib/communications/provider-adapter";

// SendGrid's Event Webhook signs timestamp + raw body with ECDSA (P-256,
// SHA-256). The verification key in its settings is the base64 DER public
// key; a PEM key is accepted too. The signature is base64 DER.
// https://www.twilio.com/docs/sendgrid/for-developers/tracking-events/getting-started-event-webhook-security-features
function sendgridPublicKey(key: string): KeyObject {
  return key.includes("BEGIN PUBLIC KEY")
    ? createPublicKey(key)
    : createPublicKey({ key: Buffer.from(key.trim(), "base64"), format: "der", type: "spki" });
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
      // Stubbed only where stubs are allowed; in production a missing key
      // must not report a message as delivered (Council Review 23).
      return stubsAllowed()
        ? { accepted: true, providerMessageId: `sendgrid-stub-${Date.now()}` }
        : { accepted: false, errorCode: PROVIDER_NOT_CONFIGURED, errorMessage: "Sendgrid isn't configured." };
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
      console.error("[sendgrid] SENDGRID_WEBHOOK_VERIFICATION_KEY is not set — rejecting webhook (S2).");
      return false;
    }

    const signature = headers["x-twilio-email-event-webhook-signature"] ?? "";
    const timestamp = headers["x-twilio-email-event-webhook-timestamp"] ?? "";

    if (!signature || !timestamp) {
      return false;
    }

    try {
      return verify(
        "sha256",
        Buffer.from(timestamp + rawBody, "utf8"),
        sendgridPublicKey(verificationKey),
        Buffer.from(signature, "base64"),
      );
    } catch {
      // A malformed key or signature is a rejection, not a crash.
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
