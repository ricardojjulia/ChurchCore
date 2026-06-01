import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const verifyMock = vi.fn();

vi.mock("svix", () => ({
  Webhook: vi.fn().mockImplementation(() => ({ verify: verifyMock })),
}));

import { resendAdapter } from "@/lib/communications/resend-adapter";

describe("resendAdapter", () => {
  const originalFetch = global.fetch;
  const env = process.env;

  beforeEach(() => {
    vi.restoreAllMocks();
    verifyMock.mockReset();
    process.env = { ...env };
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = env;
  });

  // ── send ──────────────────────────────────────────────────────────────────

  it("returns stub result when RESEND_API_KEY is absent", async () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;

    const fetchSpy = vi.spyOn(global, "fetch");

    const result = await resendAdapter.send({
      to: "member@example.com",
      subject: "Hello",
      body: "Body text",
    });

    expect(result.accepted).toBe(true);
    expect(result.providerMessageId).toMatch(/^resend-stub-/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns accepted result when provider returns 200 with id", async () => {
    process.env.RESEND_API_KEY = "re-test";
    process.env.RESEND_FROM_EMAIL = "noreply@example.com";

    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "msg-abc" }), { status: 200 }),
    ) as typeof fetch;

    const result = await resendAdapter.send({
      to: "member@example.com",
      subject: "Hello",
      body: "Body text",
    });

    expect(result).toEqual({ accepted: true, providerMessageId: "msg-abc" });
  });

  it("returns failure result when provider returns 422", async () => {
    process.env.RESEND_API_KEY = "re-test";
    process.env.RESEND_FROM_EMAIL = "noreply@example.com";

    global.fetch = vi.fn().mockResolvedValue(
      new Response("unprocessable entity", { status: 422 }),
    ) as typeof fetch;

    const result = await resendAdapter.send({
      to: "member@example.com",
      subject: "Hello",
      body: "Body text",
    });

    expect(result.accepted).toBe(false);
    expect(result.errorCode).toBe("resend_422");
  });

  it("returns network_error when fetch throws", async () => {
    process.env.RESEND_API_KEY = "re-test";
    process.env.RESEND_FROM_EMAIL = "noreply@example.com";

    global.fetch = vi.fn().mockRejectedValue(new Error("fetch failed")) as typeof fetch;

    const result = await resendAdapter.send({
      to: "member@example.com",
      subject: "Hello",
      body: "Body text",
    });

    expect(result.accepted).toBe(false);
    expect(result.errorCode).toBe("network_error");
    expect(result.errorMessage).toBe("fetch failed");
  });

  // ── verifyWebhookSignature ─────────────────────────────────────────────────

  it("returns true (stub-pass) when RESEND_WEBHOOK_SECRET is absent", () => {
    delete process.env.RESEND_WEBHOOK_SECRET;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const ok = resendAdapter.verifyWebhookSignature("{}", {
      "svix-id": "id",
      "svix-timestamp": "ts",
      "svix-signature": "sig",
    });

    expect(ok).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(
      "[resend] RESEND_WEBHOOK_SECRET is not set — webhook signature verification is disabled. Set this in production.",
    );
  });

  it("returns false when svix-id header is missing", () => {
    process.env.RESEND_WEBHOOK_SECRET = "whsec_test";

    const ok = resendAdapter.verifyWebhookSignature("{}", {
      "svix-timestamp": "ts",
      "svix-signature": "sig",
    });

    expect(ok).toBe(false);
  });

  it("returns false when Webhook.verify throws", () => {
    process.env.RESEND_WEBHOOK_SECRET = "whsec_test";
    verifyMock.mockImplementation(() => {
      throw new Error("bad signature");
    });

    const ok = resendAdapter.verifyWebhookSignature("{}", {
      "svix-id": "id",
      "svix-timestamp": "ts",
      "svix-signature": "bad",
    });

    expect(ok).toBe(false);
  });

  // ── normalizeWebhookEvent ──────────────────────────────────────────────────

  it("returns null for an unknown event type", () => {
    const event = resendAdapter.normalizeWebhookEvent(
      JSON.stringify({ type: "email.subscribed", created_at: "2026-06-01T00:00:00Z", data: {} }),
      {},
    );

    expect(event).toBeNull();
  });

  it("maps email.delivered correctly", () => {
    const event = resendAdapter.normalizeWebhookEvent(
      JSON.stringify({
        type: "email.delivered",
        created_at: "2026-06-01T10:00:00.000Z",
        data: { email_id: "msg-1", to: ["member@example.com"] },
      }),
      {},
    );

    expect(event).toMatchObject({
      provider: "resend",
      channel: "email",
      status: "delivered",
      providerMessageId: "msg-1",
      recipient: "member@example.com",
    });
  });

  it("maps email.bounced and populates reason", () => {
    const event = resendAdapter.normalizeWebhookEvent(
      JSON.stringify({
        type: "email.bounced",
        created_at: "2026-06-01T10:00:00.000Z",
        data: {
          email_id: "msg-2",
          to: ["bounce@example.com"],
          bounce: { message: "mailbox full" },
        },
      }),
      {},
    );

    expect(event).toMatchObject({
      status: "bounced",
      providerMessageId: "msg-2",
      recipient: "bounce@example.com",
      reason: "mailbox full",
    });
  });

  it("maps email.complained to suppressed status", () => {
    const event = resendAdapter.normalizeWebhookEvent(
      JSON.stringify({
        type: "email.complained",
        created_at: "2026-06-01T10:00:00.000Z",
        data: {
          email_id: "msg-3",
          to: "spam@example.com",
          complaint: { feedback_type: "abuse" },
        },
      }),
      {},
    );

    expect(event).toMatchObject({
      status: "suppressed",
      providerMessageId: "msg-3",
      reason: "abuse",
    });
  });

  it("returns null for malformed JSON", () => {
    const event = resendAdapter.normalizeWebhookEvent("not-json", {});

    expect(event).toBeNull();
  });
});
