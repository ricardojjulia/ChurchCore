import { createHmac } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { sendgridAdapter } from "@/lib/communications/sendgrid-adapter";
import { twilioAdapter } from "@/lib/communications/twilio-adapter";

describe("webhook signature verification", () => {
  const env = process.env;

  afterEach(() => {
    process.env = { ...env };
  });

  it("requires sendgrid signature when verification key is configured", () => {
    process.env.SENDGRID_WEBHOOK_VERIFICATION_KEY = "sendgrid-secret";

    const valid = sendgridAdapter.verifyWebhookSignature("[]", {
      "x-sendgrid-timestamp": "1716900000",
      "x-sendgrid-signature": createHmac("sha256", "sendgrid-secret")
        .update("1716900000.[]", "utf8")
        .digest("hex"),
    });

    const invalid = sendgridAdapter.verifyWebhookSignature("[]", {
      "x-sendgrid-timestamp": "1716900000",
      "x-sendgrid-signature": "invalid",
    });

    expect(valid).toBe(true);
    expect(invalid).toBe(false);
  });

  it("requires twilio signature when auth token is configured", () => {
    process.env.TWILIO_AUTH_TOKEN = "twilio-secret";

    const valid = twilioAdapter.verifyWebhookSignature("foo=bar", {
      "x-twilio-request-timestamp": "1716900000",
      "x-twilio-signature": createHmac("sha256", "twilio-secret")
        .update("1716900000.foo=bar", "utf8")
        .digest("hex"),
    });

    const invalid = twilioAdapter.verifyWebhookSignature("foo=bar", {
      "x-twilio-request-timestamp": "1716900000",
      "x-twilio-signature": "invalid",
    });

    expect(valid).toBe(true);
    expect(invalid).toBe(false);
  });
});
