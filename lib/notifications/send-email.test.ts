import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EMAIL_PROVIDER_NOT_CONFIGURED } from "@/lib/notifications/email-provider";
import { sendEmail } from "@/lib/notifications/send-email";

const message = { to: "a@example.org", subject: "Hi", text: "Hi" };

describe("sendEmail without provider keys (Council Review 42)", () => {
  beforeEach(() => {
    vi.stubEnv("SENDGRID_API_KEY", "");
    vi.stubEnv("SENDGRID_FROM_EMAIL", "");
    vi.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns a stub success where stubs are allowed (development)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const result = await sendEmail(message);
    expect(result.accepted).toBe(true);
  });

  it("returns a stub success in demo mode, even in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    expect((await sendEmail(message)).accepted).toBe(true);
  });

  it("refuses with provider_not_configured in production, never faking delivery", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect(await sendEmail(message)).toEqual({ accepted: false, error: EMAIL_PROVIDER_NOT_CONFIGURED });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
