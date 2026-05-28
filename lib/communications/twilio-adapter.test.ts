import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { twilioAdapter } from "@/lib/communications/twilio-adapter";

describe("twilioAdapter", () => {
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
    process.env.TWILIO_ACCOUNT_SID = "AC123";
    process.env.TWILIO_AUTH_TOKEN = "token";
    process.env.TWILIO_FROM_NUMBER = "+15555550100";

    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ sid: "SM123" }), {
        status: 201,
      }),
    ) as typeof fetch;

    const result = await twilioAdapter.send({
      to: "+15555550101",
      body: "Hello",
    });

    expect(result).toEqual({
      accepted: true,
      providerMessageId: "SM123",
    });
  });

  it("returns failure when provider rejects send", async () => {
    process.env.TWILIO_ACCOUNT_SID = "AC123";
    process.env.TWILIO_AUTH_TOKEN = "token";
    process.env.TWILIO_FROM_NUMBER = "+15555550100";

    global.fetch = vi.fn().mockResolvedValue(
      new Response("rate limited", {
        status: 429,
      }),
    ) as typeof fetch;

    const result = await twilioAdapter.send({
      to: "+15555550101",
      body: "Hello",
    });

    expect(result.accepted).toBe(false);
    expect(result.errorCode).toBe("twilio_429");
  });

  it("rejects webhook when signature is invalid", () => {
    process.env.TWILIO_AUTH_TOKEN = "secret";

    const ok = twilioAdapter.verifyWebhookSignature("foo=bar", {
      "x-twilio-signature": "deadbeef",
      "x-twilio-request-timestamp": "1716900000",
    });

    expect(ok).toBe(false);
  });

  it("normalizes a twilio webhook event", () => {
    const event = twilioAdapter.normalizeWebhookEvent(
      "MessageSid=SM123&MessageStatus=delivered&To=%2B15555550101",
      {},
    );

    expect(event).toMatchObject({
      provider: "twilio",
      channel: "sms",
      providerMessageId: "SM123",
      status: "delivered",
      recipient: "+15555550101",
    });
  });
});
