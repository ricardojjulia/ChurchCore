import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  sendgridVerifyMock,
  sendgridNormalizeMock,
  twilioVerifyMock,
  twilioNormalizeMock,
  recordProviderWebhookEventMock,
} = vi.hoisted(() => ({
  sendgridVerifyMock: vi.fn(),
  sendgridNormalizeMock: vi.fn(),
  twilioVerifyMock: vi.fn(),
  twilioNormalizeMock: vi.fn(),
  recordProviderWebhookEventMock: vi.fn(),
}));

vi.mock("@/lib/communications/sendgrid-adapter", () => ({
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

vi.mock("@/lib/communications/webhook-events", () => ({
  recordProviderWebhookEvent: recordProviderWebhookEventMock,
}));

import { POST as sendgridWebhookPost } from "@/app/api/webhooks/sendgrid/route";
import { POST as twilioWebhookPost } from "@/app/api/webhooks/twilio/route";

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

  it("records normalized sendgrid events", async () => {
    sendgridVerifyMock.mockReturnValue(true);
    sendgridNormalizeMock.mockReturnValue({
      provider: "sendgrid",
      channel: "email",
      eventId: "evt-1",
      providerMessageId: "msg-1",
      status: "delivered",
      occurredAtIso: "2026-05-28T00:00:00.000Z",
    });
    recordProviderWebhookEventMock.mockResolvedValue({ recorded: true });

    const response = await sendgridWebhookPost(
      new NextRequest("http://localhost/api/webhooks/sendgrid", {
        method: "POST",
        body: JSON.stringify([{ event: "delivered" }]),
      }),
    );

    expect(response.status).toBe(200);
    expect(recordProviderWebhookEventMock).toHaveBeenCalledTimes(1);
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
});
