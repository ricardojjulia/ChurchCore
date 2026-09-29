import { afterEach, describe, expect, it, vi } from "vitest";

// Council Review 23: with their keys missing, the SendGrid, Twilio and Resend
// adapters reported every message as delivered, in any environment, so a
// production deploy without keys told admins "Email sent." when nothing was.
// Stubs now run only outside production or in demo mode.

import { PROVIDER_NOT_CONFIGURED } from "@/lib/communications/provider-adapter";
import { resendAdapter } from "@/lib/communications/resend-adapter";
import { sendgridAdapter } from "@/lib/communications/sendgrid-adapter";
import { twilioAdapter } from "@/lib/communications/twilio-adapter";

const adapters = [
  ["sendgrid", sendgridAdapter, ["SENDGRID_API_KEY", "SENDGRID_FROM_EMAIL"]],
  ["twilio", twilioAdapter, ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER"]],
  ["resend", resendAdapter, ["RESEND_API_KEY", "RESEND_FROM_EMAIL"]],
] as const;

const payload = { to: "someone@example.org", subject: "Hi", body: "Hello" };

describe.each(adapters)("%s adapter without keys", (name, adapter, keys) => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function withoutKeys(nodeEnv: string, demo = "") {
    for (const key of keys) vi.stubEnv(key, "");
    vi.stubEnv("NODE_ENV", nodeEnv);
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", demo);
  }

  it("stubs a delivery outside production", async () => {
    withoutKeys("development");
    const result = await adapter.send(payload);
    expect(result.accepted).toBe(true);
    expect(result.providerMessageId).toMatch(new RegExp(`^${name}-stub-`));
  });

  it("stubs a delivery in production only in demo mode", async () => {
    withoutKeys("production", "true");
    expect((await adapter.send(payload)).accepted).toBe(true);
  });

  it("never claims a delivery in production", async () => {
    withoutKeys("production");
    expect(await adapter.send(payload)).toMatchObject({ accepted: false, errorCode: PROVIDER_NOT_CONFIGURED });
  });
});
