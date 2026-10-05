import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sendEmail } from "@/lib/notifications/send-email";

// G5.1: the direct sendEmail path uses the same provider selection as the queue.

const originalFetch = global.fetch;
const message = { to: "donor@example.org", subject: "Hi", text: "Hi", html: "<p>Hi</p>" };

function mockFetch(response: Response) {
  const fn = vi.fn(async () => response);
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

beforeEach(() => {
  vi.stubEnv("RESEND_API_KEY", "");
  vi.stubEnv("RESEND_FROM_EMAIL", "");
  vi.stubEnv("SENDGRID_API_KEY", "");
  vi.stubEnv("SENDGRID_FROM_EMAIL", "");
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  global.fetch = originalFetch;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("sendEmail provider selection", () => {
  it("sends through Resend with the idempotency key when Resend is configured", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_key");
    vi.stubEnv("RESEND_FROM_EMAIL", "receipts@example.org");
    const fetchMock = mockFetch(new Response(JSON.stringify({ id: "re-msg-1" }), { status: 200 }));

    const result = await sendEmail({ ...message, idempotencyKey: "donation-1" });

    expect(result).toEqual({ accepted: true, messageId: "re-msg-1", provider: "resend" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("donation-1");
    expect(JSON.parse(init.body as string)).toMatchObject({ to: ["donor@example.org"], text: "Hi", html: "<p>Hi</p>" });
  });

  it("sends through SendGrid, without any idempotency header, when only SendGrid is configured", async () => {
    vi.stubEnv("SENDGRID_API_KEY", "SG.key");
    vi.stubEnv("SENDGRID_FROM_EMAIL", "noreply@example.org");
    const fetchMock = mockFetch(new Response(null, { status: 202, headers: { "x-message-id": "sg-1" } }));

    const result = await sendEmail({ ...message, idempotencyKey: "donation-1" });

    expect(result).toEqual({ accepted: true, messageId: "sg-1", provider: "sendgrid" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.sendgrid.com/v3/mail/send");
    expect(Object.keys(init.headers as object)).toEqual(["Authorization", "Content-Type"]);
  });

  it("returns the shared error code and the provider's message on refusal", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_key");
    vi.stubEnv("RESEND_FROM_EMAIL", "receipts@example.org");
    mockFetch(new Response(JSON.stringify({ name: "rate_limit_exceeded", message: "Slow down" }), { status: 429 }));

    const result = await sendEmail(message);

    expect(result).toMatchObject({ accepted: false, errorCode: "rate_limited", provider: "resend" });
    expect(result.error).toContain("Slow down");
  });

  it("gives each recipient its own request and key", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_key");
    vi.stubEnv("RESEND_FROM_EMAIL", "receipts@example.org");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "m" }), { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await sendEmail({ ...message, to: ["a@example.org", "b@example.org"], idempotencyKey: "k" });

    const keys = fetchMock.mock.calls.map((c) => ((c as unknown as [string, RequestInit])[1].headers as Record<string, string>)["Idempotency-Key"]);
    expect(keys).toEqual(["k:0", "k:1"]);
  });

  it("keeps the production refusal when no provider is configured (stubs unchanged)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect(await sendEmail(message)).toEqual({ accepted: false, error: "provider_not_configured" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
