import { generateKeyPairSync, sign } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { sendgridAdapter } from "@/lib/communications/sendgrid-adapter";
import { twilioAdapter, twilioSignature } from "@/lib/communications/twilio-adapter";

// S2: each webhook verifies the provider's real signing scheme and fails
// closed when its secret is unset. Before, SendGrid and Twilio checked an
// HMAC scheme neither provider uses (so a configured secret rejected every
// real event) and an unset secret accepted anything.

describe("webhook signature verification (S2)", () => {
  const env = process.env;

  afterEach(() => {
    process.env = { ...env };
    vi.restoreAllMocks();
  });

  describe("Twilio: HMAC-SHA1 over the URL and sorted form fields", () => {
    // The worked example from Twilio's request-validation docs.
    const url = "https://mycompany.com/myapp.php?foo=1&bar=2";
    const body = "CallSid=CA1234567890ABCDE&Caller=%2B12349013030&Digits=1234&From=%2B12349013030&To=%2B18005551212";
    const published = "0/KCTR6DLpKmkAf8muzZqo1nDgQ=";

    it("matches Twilio's published example signature", () => {
      expect(twilioSignature("12345", url, body)).toBe(published);
    });

    it("accepts that request, and rejects it at another URL, with another token, or tampered", () => {
      process.env.TWILIO_AUTH_TOKEN = "12345";
      expect(twilioAdapter.verifyWebhookSignature(body, { "x-twilio-signature": published }, url)).toBe(true);
      expect(
        twilioAdapter.verifyWebhookSignature(body, { "x-twilio-signature": published }, "https://evil.example/hook"),
      ).toBe(false);
      expect(twilioAdapter.verifyWebhookSignature(`${body}&Extra=1`, { "x-twilio-signature": published }, url)).toBe(false);
      process.env.TWILIO_AUTH_TOKEN = "other-token";
      expect(twilioAdapter.verifyWebhookSignature(body, { "x-twilio-signature": published }, url)).toBe(false);
    });

    it("rejects everything when TWILIO_AUTH_TOKEN is unset or no public URL is known", () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      delete process.env.TWILIO_AUTH_TOKEN;
      expect(twilioAdapter.verifyWebhookSignature(body, { "x-twilio-signature": published }, url)).toBe(false);
      process.env.TWILIO_AUTH_TOKEN = "12345";
      expect(twilioAdapter.verifyWebhookSignature(body, { "x-twilio-signature": published }, null)).toBe(false);
    });

    it("rejects a missing signature header", () => {
      process.env.TWILIO_AUTH_TOKEN = "12345";
      expect(twilioAdapter.verifyWebhookSignature(body, {}, url)).toBe(false);
    });
  });

  describe("SendGrid: ECDSA P-256 over timestamp + body", () => {
    const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const publicDerBase64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");
    const body = JSON.stringify([{ event: "bounce", email: "gone@example.test", sg_message_id: "msg-1" }]);
    const timestamp = "1716900000";
    const signature = sign("sha256", Buffer.from(timestamp + body), privateKey).toString("base64");
    const headers = {
      "x-twilio-email-event-webhook-signature": signature,
      "x-twilio-email-event-webhook-timestamp": timestamp,
    };

    it("accepts a request signed by the key's private half (base64 DER or PEM key)", () => {
      process.env.SENDGRID_WEBHOOK_VERIFICATION_KEY = publicDerBase64;
      expect(sendgridAdapter.verifyWebhookSignature(body, headers)).toBe(true);
      process.env.SENDGRID_WEBHOOK_VERIFICATION_KEY = publicKey.export({ format: "pem", type: "spki" }).toString();
      expect(sendgridAdapter.verifyWebhookSignature(body, headers)).toBe(true);
    });

    it("rejects a tampered body, a different timestamp, or another key", () => {
      process.env.SENDGRID_WEBHOOK_VERIFICATION_KEY = publicDerBase64;
      expect(sendgridAdapter.verifyWebhookSignature(body.replace("bounce", "delivered"), headers)).toBe(false);
      expect(
        sendgridAdapter.verifyWebhookSignature(body, { ...headers, "x-twilio-email-event-webhook-timestamp": "1716900001" }),
      ).toBe(false);
      const other = generateKeyPairSync("ec", { namedCurve: "prime256v1" }).publicKey;
      process.env.SENDGRID_WEBHOOK_VERIFICATION_KEY = other.export({ format: "der", type: "spki" }).toString("base64");
      expect(sendgridAdapter.verifyWebhookSignature(body, headers)).toBe(false);
    });

    it("rejects, without throwing, a malformed key or signature", () => {
      process.env.SENDGRID_WEBHOOK_VERIFICATION_KEY = "not-a-key";
      expect(sendgridAdapter.verifyWebhookSignature(body, headers)).toBe(false);
      process.env.SENDGRID_WEBHOOK_VERIFICATION_KEY = publicDerBase64;
      expect(
        sendgridAdapter.verifyWebhookSignature(body, { ...headers, "x-twilio-email-event-webhook-signature": "deadbeef" }),
      ).toBe(false);
    });

    it("rejects everything when SENDGRID_WEBHOOK_VERIFICATION_KEY is unset", () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      delete process.env.SENDGRID_WEBHOOK_VERIFICATION_KEY;
      expect(sendgridAdapter.verifyWebhookSignature(body, headers)).toBe(false);
    });
  });
});
