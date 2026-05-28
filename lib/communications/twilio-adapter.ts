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

function normalizeTwilioStatus(status: string): NormalizedProviderWebhookEvent["status"] {
  const normalized = status.toLowerCase();

  if (normalized === "queued" || normalized === "accepted" || normalized === "sending") {
    return "sending";
  }

  if (normalized === "sent") {
    return "sent";
  }

  if (normalized === "delivered") {
    return "delivered";
  }

  if (normalized === "undelivered") {
    return "failed";
  }

  if (normalized === "failed") {
    return "failed";
  }

  return "cancelled";
}

function parseFormBody(rawBody: string): URLSearchParams {
  return new URLSearchParams(rawBody);
}

export const twilioAdapter: ProviderAdapter = {
  provider: "twilio",
  channel: "sms",
  async send(payload: ProviderSendPayload): Promise<ProviderSendResult> {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_FROM_NUMBER;

    if (!accountSid || !authToken || !fromNumber) {
      return {
        accepted: true,
        providerMessageId: `twilio-stub-${Date.now()}`,
      };
    }

    const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: payload.to,
          From: fromNumber,
          Body: payload.body,
        }).toString(),
      },
    );

    if (response.ok) {
      const json = (await response.json()) as { sid?: string };
      return {
        accepted: true,
        providerMessageId: json.sid,
      };
    }

    const text = await response.text().catch(() => "");
    return {
      accepted: false,
      errorCode: `twilio_${response.status}`,
      errorMessage: text || `Twilio request failed (${response.status})`,
    };
  },

  verifyWebhookSignature(rawBody: string, headers: Record<string, string>): boolean {
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!authToken) {
      return true;
    }

    const signature = headers["x-twilio-signature"] ?? "";
    const timestamp = headers["x-twilio-request-timestamp"] ?? "";

    if (!signature || !timestamp) {
      return false;
    }

    const signedPayload = `${timestamp}.${rawBody}`;
    const expected = buildHmac(signedPayload, authToken);

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
    const payload = parseFormBody(rawBody);
    const sid = payload.get("MessageSid") ?? payload.get("SmsSid") ?? "";
    const status = payload.get("MessageStatus") ?? payload.get("SmsStatus") ?? "";

    if (!sid || !status) {
      return null;
    }

    return {
      provider: "twilio",
      channel: "sms",
      eventId: `${sid}:${status}`,
      providerMessageId: sid,
      status: normalizeTwilioStatus(status),
      occurredAtIso: new Date().toISOString(),
      recipient: payload.get("To") ?? undefined,
      reason: payload.get("ErrorMessage") ?? undefined,
    };
  },
};
