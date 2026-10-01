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

    const ok = twilioAdapter.verifyWebhookSignature(
      "foo=bar",
      { "x-twilio-signature": "deadbeef" },
      "https://app.example/api/webhooks/twilio",
    );

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

  it("records a send refused because the recipient replied STOP (error 21610) as an unsubscribe (S2)", () => {
    const event = twilioAdapter.normalizeWebhookEvent(
      "MessageSid=SM9&MessageStatus=undelivered&ErrorCode=21610&To=%2B15555550101",
      {},
    );
    expect(event).toMatchObject({ status: "unsubscribed", recipient: "+15555550101", providerMessageId: "SM9" });

    const otherFailure = twilioAdapter.normalizeWebhookEvent(
      "MessageSid=SM10&MessageStatus=undelivered&ErrorCode=30003",
      {},
    );
    expect(otherFailure?.status).toBe("failed");
  });

  it("asks Twilio for status callbacks at the app's webhook, so STOPs and deliveries come back (S2)", async () => {
    process.env.TWILIO_ACCOUNT_SID = "AC123";
    process.env.TWILIO_AUTH_TOKEN = "token";
    process.env.TWILIO_FROM_NUMBER = "+15555550100";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example/";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ sid: "SM1" }), { status: 201 }));
    global.fetch = fetchMock as typeof fetch;

    await twilioAdapter.send({ to: "+15555550101", body: "Hello" });

    const body = new URLSearchParams(fetchMock.mock.calls[0][1].body as string);
    expect(body.get("StatusCallback")).toBe("https://app.example/api/webhooks/twilio");
  });

  it("gives a retried callback the same idempotency key, though Twilio sends no event time (PR #166 review)", async () => {
    const { buildProviderWebhookIdempotencyKey } = await import("@/lib/communications/provider-adapter");
    const body = "MessageSid=SM9&MessageStatus=undelivered&ErrorCode=21610&To=%2B15555550101";
    const first = twilioAdapter.normalizeWebhookEvent(body, {})!;
    await new Promise((resolve) => setTimeout(resolve, 5));
    const retry = twilioAdapter.normalizeWebhookEvent(body, {})!;

    expect(buildProviderWebhookIdempotencyKey(retry)).toBe(buildProviderWebhookIdempotencyKey(first));
    expect(buildProviderWebhookIdempotencyKey(first)).toBe("twilio:SM9:undelivered:21610");
  });
});
