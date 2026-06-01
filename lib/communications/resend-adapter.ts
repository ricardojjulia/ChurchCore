import { Webhook } from "svix";

import type {
  NormalizedProviderWebhookEvent,
  ProviderAdapter,
  ProviderSendPayload,
  ProviderSendResult,
} from "@/lib/communications/provider-adapter";

function parseJson(rawBody: string): unknown {
  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    return null;
  }
}

export const resendAdapter: ProviderAdapter = {
  provider: "resend",
  channel: "email",

  async send(payload: ProviderSendPayload): Promise<ProviderSendResult> {
    const apiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL;

    if (!apiKey || !fromEmail) {
      return {
        accepted: true,
        providerMessageId: `resend-stub-${Date.now()}`,
      };
    }

    const body: Record<string, unknown> = {
      from: fromEmail,
      to: [payload.to],
      subject: payload.subject ?? "(no subject)",
      text: payload.body,
    };

    if (payload.html) {
      body.html = payload.html;
    }

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (response.status === 200 || response.status === 201) {
        const json = (await response.json()) as { id?: string };
        return {
          accepted: true,
          providerMessageId: json.id,
        };
      }

      const text = await response.text().catch(() => "");
      return {
        accepted: false,
        errorCode: `resend_${response.status}`,
        errorMessage: text || `Resend request failed (${response.status})`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        accepted: false,
        errorCode: "network_error",
        errorMessage: message,
      };
    }
  },

  verifyWebhookSignature(rawBody: string, headers: Record<string, string>): boolean {
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    if (!secret) {
      console.warn("[resend] RESEND_WEBHOOK_SECRET is not set — webhook signature verification is disabled. Set this in production.");
      return true;
    }

    const svixId = headers["svix-id"] ?? "";
    const svixTimestamp = headers["svix-timestamp"] ?? "";
    const svixSignature = headers["svix-signature"] ?? "";

    if (!svixId || !svixTimestamp || !svixSignature) {
      return false;
    }

    try {
      new Webhook(secret).verify(rawBody, {
        "svix-id": svixId,
        "svix-timestamp": svixTimestamp,
        "svix-signature": svixSignature,
      });
      return true;
    } catch {
      return false;
    }
  },

  normalizeWebhookEvent(
    rawBody: string,
    _headers: Record<string, string>,
  ): NormalizedProviderWebhookEvent | null {
    void _headers;
    const parsed = parseJson(rawBody);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    const obj = parsed as Record<string, unknown>;
    const type = typeof obj.type === "string" ? obj.type : "";
    const createdAt = typeof obj.created_at === "string" ? obj.created_at : "";
    const data =
      obj.data !== null && typeof obj.data === "object" && !Array.isArray(obj.data)
        ? (obj.data as Record<string, unknown>)
        : {};

    const providerMessageId = typeof data.email_id === "string" ? data.email_id : "";
    const recipient = Array.isArray(data.to)
      ? (data.to[0] as string | undefined)
      : typeof data.to === "string"
        ? data.to
        : undefined;

    const occurredAtDate = createdAt ? new Date(createdAt) : new Date();
    const occurredAtIso = isNaN(occurredAtDate.getTime())
      ? new Date().toISOString()
      : occurredAtDate.toISOString();

    const bounceData =
      data.bounce !== null && typeof data.bounce === "object" && !Array.isArray(data.bounce)
        ? (data.bounce as Record<string, unknown>)
        : null;
    const complaintData =
      data.complaint !== null &&
      typeof data.complaint === "object" &&
      !Array.isArray(data.complaint)
        ? (data.complaint as Record<string, unknown>)
        : null;

    const reason =
      (bounceData && typeof bounceData.message === "string" ? bounceData.message : undefined) ??
      (complaintData && typeof complaintData.feedback_type === "string"
        ? complaintData.feedback_type
        : undefined);

    const eventId = `${type}:${providerMessageId}:${occurredAtIso}`;

    const statusMap: Record<string, NormalizedProviderWebhookEvent["status"]> = {
      "email.sent": "sent",
      "email.delivered": "delivered",
      "email.delivery_delayed": "sending",
      "email.bounced": "bounced",
      "email.complained": "suppressed",
      "email.clicked": "sent",
      "email.opened": "sent",
    };

    const status = statusMap[type];
    if (!status) {
      return null;
    }

    return {
      provider: "resend",
      channel: "email",
      eventId,
      providerMessageId: providerMessageId || undefined,
      status,
      occurredAtIso,
      recipient,
      reason,
    };
  },
};
