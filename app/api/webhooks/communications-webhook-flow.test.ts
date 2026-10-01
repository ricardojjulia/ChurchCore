import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  sendgridVerifyMock,
  sendgridNormalizeMock,
  twilioVerifyMock,
  twilioNormalizeMock,
  resendVerifyMock,
  resendNormalizeMock,
  recordProviderWebhookEventMock,
} = vi.hoisted(() => ({
  sendgridVerifyMock: vi.fn(),
  sendgridNormalizeMock: vi.fn(),
  twilioVerifyMock: vi.fn(),
  twilioNormalizeMock: vi.fn(),
  resendVerifyMock: vi.fn(),
  resendNormalizeMock: vi.fn(),
  recordProviderWebhookEventMock: vi.fn(),
}));

vi.mock("@/lib/communications/sendgrid-adapter", async (importOriginal) => ({
  // The batch normalizer is pure: use the real one.
  normalizeSendgridEvents: (await importOriginal<typeof import("@/lib/communications/sendgrid-adapter")>())
    .normalizeSendgridEvents,
  sendgridAdapter: {
    verifyWebhookSignature: sendgridVerifyMock,
    normalizeWebhookEvent: sendgridNormalizeMock,
  },
}));

vi.mock("@/lib/communications/twilio-adapter", () => ({
  twilioAdapter: {
    verifyWebhookSignature: twilioVerifyMock,
    normalizeWebhookEvent: twilioNormalizeMock,
  },
}));

vi.mock("@/lib/communications/resend-adapter", () => ({
  resendAdapter: {
    verifyWebhookSignature: resendVerifyMock,
    normalizeWebhookEvent: resendNormalizeMock,
  },
}));

vi.mock("@/lib/communications/webhook-events", () => ({
  recordProviderWebhookEvent: recordProviderWebhookEventMock,
}));

import { POST as sendgridWebhookPost } from "@/app/api/webhooks/sendgrid/route";
import { POST as twilioWebhookPost } from "@/app/api/webhooks/twilio/route";
import { POST as resendWebhookPost } from "@/app/api/webhooks/resend/route";

describe("communications webhook routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects invalid sendgrid signatures", async () => {
    sendgridVerifyMock.mockReturnValue(false);

    const response = await sendgridWebhookPost(
      new NextRequest("http://localhost/api/webhooks/sendgrid", {
        method: "POST",
        body: JSON.stringify([]),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("records every event in a SendGrid batch, not only the first (PR #166 review)", async () => {
    sendgridVerifyMock.mockReturnValue(true);
    recordProviderWebhookEventMock.mockResolvedValue({ recorded: true });
    const batch = [
      { event: "delivered", sg_event_id: "evt-1", sg_message_id: "msg-1", email: "a@example.test", timestamp: 1716900000 },
      { event: "bounce", sg_event_id: "evt-2", sg_message_id: "msg-2", email: "b@example.test", timestamp: 1716900001 },
      null,
    ];

    const response = await sendgridWebhookPost(
      new NextRequest("http://localhost/api/webhooks/sendgrid", {
        method: "POST",
        body: JSON.stringify(batch),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ recordedCount: 2, received: 2 });
    expect(recordProviderWebhookEventMock).toHaveBeenCalledTimes(2);
    expect(recordProviderWebhookEventMock.mock.calls[1][0]).toMatchObject({
      event: { status: "bounced", eventId: "evt-2" },
      rawBody: JSON.stringify(batch[1]),
    });
  });

  it("rejects invalid twilio signatures", async () => {
    twilioVerifyMock.mockReturnValue(false);

    const response = await twilioWebhookPost(
      new NextRequest("http://localhost/api/webhooks/twilio", {
        method: "POST",
        body: "MessageSid=SM123",
      }),
    );

    expect(response.status).toBe(401);
  });

  it("records normalized twilio events", async () => {
    twilioVerifyMock.mockReturnValue(true);
    twilioNormalizeMock.mockReturnValue({
      provider: "twilio",
      channel: "sms",
      eventId: "SM123:delivered",
      providerMessageId: "SM123",
      status: "delivered",
      occurredAtIso: "2026-05-28T00:00:00.000Z",
    });
    recordProviderWebhookEventMock.mockResolvedValue({ recorded: true });

    const response = await twilioWebhookPost(
      new NextRequest("http://localhost/api/webhooks/twilio", {
        method: "POST",
        body: "MessageSid=SM123&MessageStatus=delivered",
      }),
    );

    expect(response.status).toBe(200);
    expect(recordProviderWebhookEventMock).toHaveBeenCalledTimes(1);
  });

  it("verifies a Twilio signature against the app's public URL, not the proxied request host (S2)", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example");
    twilioVerifyMock.mockReturnValue(false);

    await twilioWebhookPost(
      new NextRequest("http://internal-host:3000/api/webhooks/twilio?x=1", {
        method: "POST",
        body: "MessageSid=SM123&MessageStatus=delivered",
      }),
    );

    expect(twilioVerifyMock).toHaveBeenCalledWith(
      "MessageSid=SM123&MessageStatus=delivered",
      expect.any(Object),
      "https://app.example/api/webhooks/twilio?x=1",
    );
    vi.unstubAllEnvs();
  });

  it("rejects Resend webhook when signature is invalid", async () => {
    resendVerifyMock.mockReturnValue(false);

    const response = await resendWebhookPost(
      new NextRequest("http://localhost/api/webhooks/resend", {
        method: "POST",
        body: JSON.stringify({ type: "email.delivered" }),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("returns 400 for Resend webhook when normalizeWebhookEvent returns null", async () => {
    resendVerifyMock.mockReturnValue(true);
    resendNormalizeMock.mockReturnValue(null);

    const response = await resendWebhookPost(
      new NextRequest("http://localhost/api/webhooks/resend", {
        method: "POST",
        body: JSON.stringify({ type: "email.unsupported" }),
      }),
    );

    expect(response.status).toBe(400);
  });

  it("records Resend webhook event successfully", async () => {
    resendVerifyMock.mockReturnValue(true);
    resendNormalizeMock.mockReturnValue({
      provider: "resend",
      channel: "email",
      eventId: "email.delivered:msg-1:2026-06-01T00:00:00.000Z",
      providerMessageId: "msg-1",
      status: "delivered",
      occurredAtIso: "2026-06-01T00:00:00.000Z",
    });
    recordProviderWebhookEventMock.mockResolvedValue({ recorded: true });

    const response = await resendWebhookPost(
      new NextRequest("http://localhost/api/webhooks/resend", {
        method: "POST",
        body: JSON.stringify({
          type: "email.delivered",
          created_at: "2026-06-01T00:00:00.000Z",
          data: { email_id: "msg-1" },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(recordProviderWebhookEventMock).toHaveBeenCalledTimes(1);
  });
});
