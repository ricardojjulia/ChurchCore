import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sendgridAdapter } from "@/lib/communications/sendgrid-adapter";

describe("sendgridAdapter", () => {
  const originalFetch = global.fetch;
  const env = process.env;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...env };
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = env;
  });

  it("returns accepted result when provider accepts send", async () => {
    process.env.SENDGRID_API_KEY = "sg-test";
    process.env.SENDGRID_FROM_EMAIL = "noreply@example.com";

    global.fetch = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 202,
        headers: {
          "x-message-id": "msg-123",
        },
      }),
    ) as typeof fetch;

    const result = await sendgridAdapter.send({
      to: "member@example.com",
      subject: "Hello",
      body: "Body",
    });

    expect(result).toEqual({
      accepted: true,
      providerMessageId: "msg-123",
    });
  });

  it("returns failure when provider rejects send", async () => {
    process.env.SENDGRID_API_KEY = "sg-test";
    process.env.SENDGRID_FROM_EMAIL = "noreply@example.com";

    global.fetch = vi.fn().mockResolvedValue(
      new Response("bad request", {
        status: 400,
      }),
    ) as typeof fetch;

    const result = await sendgridAdapter.send({
      to: "member@example.com",
      subject: "Hello",
      body: "Body",
    });

    expect(result.accepted).toBe(false);
    expect(result.errorCode).toBe("sendgrid_400");
  });

  it("rejects webhook when required signature is invalid", () => {
    process.env.SENDGRID_WEBHOOK_VERIFICATION_KEY = "secret";

    const ok = sendgridAdapter.verifyWebhookSignature("{}", {
      "x-sendgrid-signature": "deadbeef",
      "x-sendgrid-timestamp": "1716900000",
    });

    expect(ok).toBe(false);
  });

  it("normalizes a sendgrid webhook event", () => {
    const event = sendgridAdapter.normalizeWebhookEvent(
      JSON.stringify([
        {
          event: "delivered",
          timestamp: 1716900000,
          sg_event_id: "evt-1",
          sg_message_id: "msg-1",
          email: "member@example.com",
        },
      ]),
      {},
    );

    expect(event).toMatchObject({
      provider: "sendgrid",
      channel: "email",
      eventId: "evt-1",
      providerMessageId: "msg-1",
      status: "delivered",
      recipient: "member@example.com",
    });
  });
});
