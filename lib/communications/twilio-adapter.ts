import { createHmac, timingSafeEqual } from "node:crypto";

import type {
  NormalizedProviderWebhookEvent,
  ProviderAdapter,
  ProviderSendPayload,
  ProviderSendResult,
} from "@/lib/communications/provider-adapter";
import { appBaseUrl } from "@/lib/app-url";
import { stubsAllowed } from "@/lib/stub-mode";
import { PROVIDER_NOT_CONFIGURED } from "@/lib/communications/provider-adapter";

// Twilio's request signature: HMAC-SHA1 of the full URL Twilio called, then
// each POST parameter sorted by name, appended as name + value; base64.
// https://www.twilio.com/docs/usage/security#validating-requests
export function twilioSignature(authToken: string, url: string, rawBody: string): string {
  const params = new URLSearchParams(rawBody);
  let data = url;
  for (const key of [...new Set(params.keys())].sort()) {
    for (const value of params.getAll(key).sort()) {
      data += key + value;
    }
  }
  return createHmac("sha1", authToken).update(data, "utf8").digest("base64");
}

// Twilio error 21610: the recipient replied STOP, so Twilio refused the send.
const TWILIO_UNSUBSCRIBED_ERROR = "21610";

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
      // Stubbed only where stubs are allowed; in production a missing key
      // must not report a message as delivered (Council Review 23).
      return stubsAllowed()
        ? { accepted: true, providerMessageId: `twilio-stub-${Date.now()}` }
        : { accepted: false, errorCode: PROVIDER_NOT_CONFIGURED, errorMessage: "Twilio isn't configured." };
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
          // Without a callback Twilio reports nothing back: no delivery
          // status, and no 21610 when the recipient has replied STOP.
          ...(appBaseUrl() ? { StatusCallback: `${appBaseUrl()}/api/webhooks/twilio` } : {}),
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

  verifyWebhookSignature(
    rawBody: string,
    headers: Record<string, string>,
    requestUrl?: string | null,
  ): boolean {
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!authToken) {
      console.error("[twilio] TWILIO_AUTH_TOKEN is not set — rejecting webhook (S2).");
      return false;
    }
    if (!requestUrl) {
      console.error("[twilio] No public app URL to verify the signature against — rejecting webhook.");
      return false;
    }

    const signature = headers["x-twilio-signature"] ?? "";
    if (!signature) {
      return false;
    }

    const expected = Buffer.from(twilioSignature(authToken, requestUrl, rawBody));
    const received = Buffer.from(signature);
    return expected.length === received.length && timingSafeEqual(expected, received);
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

    // A send to someone who replied STOP comes back undelivered with 21610;
    // record it as an unsubscribe so a suppression is written (S2, F4).
    const errorCode = payload.get("ErrorCode") ?? "";
    const unsubscribed = errorCode === TWILIO_UNSUBSCRIBED_ERROR;

    return {
      provider: "twilio",
      channel: "sms",
      // Twilio's status callbacks carry no event time; this id is stable
      // across its retries of the same callback.
      eventId: errorCode ? `${sid}:${status}:${errorCode}` : `${sid}:${status}`,
      occurredAtIsReceiptTime: true,
      providerMessageId: sid,
      status: unsubscribed ? "unsubscribed" : normalizeTwilioStatus(status),
      occurredAtIso: new Date().toISOString(),
      recipient: payload.get("To") ?? undefined,
      reason: payload.get("ErrorMessage") ?? undefined,
    };
  },
};
