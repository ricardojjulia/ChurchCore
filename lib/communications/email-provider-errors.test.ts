import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resendAdapter } from "@/lib/communications/resend-adapter";
import { selectEmailProvider } from "@/lib/communications/select-email-provider";
import { sendgridAdapter } from "@/lib/communications/sendgrid-adapter";

// G5.1: Resend request shape (the documented contract), the status -> shared
// error code table for Resend and SendGrid, and provider selection.

const originalFetch = global.fetch;
const env = process.env;

beforeEach(() => {
  process.env = { ...env };
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.RESEND_FROM_EMAIL = "ChurchCore <receipts@example.org>";
  process.env.SENDGRID_API_KEY = "SG.test";
  process.env.SENDGRID_FROM_EMAIL = "noreply@example.org";
});
afterEach(() => {
  global.fetch = originalFetch;
  process.env = env;
});

function mockFetch(response: Response | Error) {
  const fn = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

const message = { to: "donor@example.org", subject: "Thank you", body: "Plain text", html: "<p>Plain text</p>" };

describe("resend request shape (resend.com/docs, verified 2026-10-05)", () => {
  it("POSTs the documented body and headers, with the Idempotency-Key", async () => {
    const fetchMock = mockFetch(new Response(JSON.stringify({ id: "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794" }), { status: 200 }));

    const result = await resendAdapter.send({ ...message, idempotencyKey: "donation-3f2a" });

    expect(result).toEqual({ accepted: true, providerMessageId: "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      Authorization: "Bearer re_test_key",
      "Content-Type": "application/json",
      "Idempotency-Key": "donation-3f2a",
    });
    expect(JSON.parse(init.body as string)).toEqual({
      from: "ChurchCore <receipts@example.org>",
      to: ["donor@example.org"],
      subject: "Thank you",
      text: "Plain text",
      html: "<p>Plain text</p>",
    });
  });

  it("omits the Idempotency-Key header when the caller has none", async () => {
    const fetchMock = mockFetch(new Response(JSON.stringify({ id: "x" }), { status: 200 }));
    await resendAdapter.send(message);
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.headers).not.toHaveProperty("Idempotency-Key");
  });

  it("caps the key at Resend's 256-character limit", async () => {
    const fetchMock = mockFetch(new Response(JSON.stringify({ id: "x" }), { status: 200 }));
    await resendAdapter.send({ ...message, idempotencyKey: "k".repeat(400) });
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toHaveLength(256);
  });

  it("sends a request timeout signal", async () => {
    const fetchMock = mockFetch(new Response(JSON.stringify({ id: "x" }), { status: 200 }));
    await resendAdapter.send(message);
    expect((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].signal).toBeInstanceOf(AbortSignal);
  });
});

describe("sendgrid request shape", () => {
  it("never sends an idempotency header (SendGrid has none)", async () => {
    const fetchMock = mockFetch(new Response(null, { status: 202, headers: { "x-message-id": "sg-1" } }));
    await sendgridAdapter.send({ ...message, idempotencyKey: "donation-3f2a" });
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(Object.keys(init.headers as object).sort()).toEqual(["Authorization", "Content-Type"]);
  });
});

const STATUS_TABLE: Array<[number, string, string | undefined]> = [
  [429, "rate_limited", "rate_limit_exceeded"],
  [500, "provider_unavailable", "application_error"],
  [502, "provider_unavailable", undefined],
  [503, "provider_unavailable", "service_unavailable"],
  [409, "temporary_failure", "concurrent_idempotent_requests"],
  [409, "invalid_request", "invalid_idempotent_request"],
  [400, "invalid_request", "validation_error"],
  [422, "invalid_request", "invalid_parameter"],
  [401, "provider_auth_error", "missing_api_key"],
  [403, "provider_auth_error", "restricted_api_key"],
  [404, "provider_config_error", "not_found"],
  [405, "provider_config_error", "method_not_allowed"],
];

describe.each([
  ["resend", resendAdapter],
  ["sendgrid", sendgridAdapter],
] as const)("%s status mapping", (name, adapter) => {
  it.each(STATUS_TABLE)("HTTP %i -> %s (%s)", async (status, code, type) => {
    mockFetch(new Response(JSON.stringify({ name: type, message: "Provider says no" }), { status }));
    const result = await adapter.send(message);
    expect(result.accepted).toBe(false);
    // SendGrid has no idempotency conflict type; its 409 body carries no type.
    if (name === "sendgrid" && type === "invalid_idempotent_request") return;
    expect(result.errorCode).toBe(code);
  });

  it("keeps the provider's message for logs without echoing the recipient", async () => {
    mockFetch(new Response(JSON.stringify({ name: "validation_error", message: "The `to` field is invalid." }), { status: 422 }));
    const result = await adapter.send(message);
    expect(result.errorMessage).toContain("422");
    expect(result.errorMessage).toContain("The `to` field is invalid.");
    expect(result.errorMessage).not.toContain("donor@example.org");
  });

  it("maps a network failure to network_error", async () => {
    mockFetch(new TypeError("fetch failed"));
    expect((await adapter.send(message)).errorCode).toBe("network_error");
  });

  it("maps a timeout to timeout", async () => {
    const timeout = new Error("The operation was aborted due to timeout");
    timeout.name = "TimeoutError";
    mockFetch(timeout);
    expect((await adapter.send(message)).errorCode).toBe("timeout");
  });

  it("maps a plain abort to network_error", async () => {
    const abort = new Error("aborted");
    abort.name = "AbortError";
    mockFetch(abort);
    expect((await adapter.send(message)).errorCode).toBe("network_error");
  });
});

describe("resend error type field", () => {
  it("falls back to `type` when `name` is absent", async () => {
    mockFetch(new Response(JSON.stringify({ type: "invalid_idempotent_request", message: "m" }), { status: 409 }));
    expect((await resendAdapter.send(message)).errorCode).toBe("invalid_request");
  });

  it("tolerates a non-JSON error body", async () => {
    mockFetch(new Response("<html>bad gateway</html>", { status: 502 }));
    const result = await resendAdapter.send(message);
    expect(result.errorCode).toBe("provider_unavailable");
    expect(result.errorMessage).toBe("Resend 502");
  });
});

describe("selectEmailProvider", () => {
  it("prefers Resend when both of its keys are set, even if SendGrid is too", () => {
    const selected = selectEmailProvider();
    expect(selected).toMatchObject({ provider: "resend", configured: true });
    expect(selected.adapter).toBe(resendAdapter);
  });

  it("falls back to SendGrid when Resend lacks a key", () => {
    delete process.env.RESEND_FROM_EMAIL;
    expect(selectEmailProvider()).toMatchObject({ provider: "sendgrid", configured: true });
    process.env.RESEND_FROM_EMAIL = "a@example.org";
    delete process.env.RESEND_API_KEY;
    expect(selectEmailProvider().adapter).toBe(sendgridAdapter);
  });

  it("is not configured when neither provider has both keys", () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.SENDGRID_FROM_EMAIL;
    expect(selectEmailProvider().configured).toBe(false);
  });
});
