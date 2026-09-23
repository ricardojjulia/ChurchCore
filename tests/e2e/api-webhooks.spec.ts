import { expect, test } from "@playwright/test";

import { signStripeWebhook, signTimestampedHmac } from "./fixtures/api";
import { getWebhookSecret } from "./fixtures/env";

/**
 * Rejection-contract tests for the four provider webhook routes (see
 * tests/coverage-manifest.json -> routes -> auth: "webhook"). None of these
 * have a documented happy path in the Story A brief (AC8 only covers cron
 * and unsubscribe) — signature verification requires the corresponding
 * secret env var to be configured, which CI/local sets to a dummy value, so
 * "no signature" and "bad signature" both reject even without real
 * provider credentials.
 */

const RAW_BODY = JSON.stringify({ type: "test.event", data: { object: {} } });

test.describe("POST /api/webhooks/stripe", () => {
  test("no Stripe-Signature header -> 401", async ({ request }) => {
    const response = await request.post("/api/webhooks/stripe", { data: RAW_BODY });
    expect(response.status()).toBe(401);
  });

  test("bad signature -> 401", async ({ request }) => {
    const response = await request.post("/api/webhooks/stripe", {
      data: RAW_BODY,
      headers: { "stripe-signature": "t=1700000000,v1=deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef" },
    });
    expect(response.status()).toBe(401);
  });

  test("well-formed but wrong-secret signature -> 401", async ({ request }) => {
    const badSig = signStripeWebhook(RAW_BODY, "not-the-real-webhook-secret");
    const response = await request.post("/api/webhooks/stripe", {
      data: RAW_BODY,
      headers: { "stripe-signature": badSig },
    });
    expect(response.status()).toBe(401);
  });
});

test.describe("POST /api/webhooks/sendgrid", () => {
  test("no signature headers -> 401", async ({ request }) => {
    const response = await request.post("/api/webhooks/sendgrid", { data: "[]" });
    expect(response.status()).toBe(401);
  });

  test("bad signature -> 401", async ({ request }) => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const response = await request.post("/api/webhooks/sendgrid", {
      data: "[]",
      headers: {
        "x-twilio-email-event-webhook-signature": Buffer.from("not-a-real-signature").toString("hex"),
        "x-twilio-email-event-webhook-timestamp": timestamp,
      },
    });
    expect(response.status()).toBe(401);
  });

  test("well-formed but wrong-secret signature -> 401", async ({ request }) => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const badSig = signTimestampedHmac("[]", "not-the-real-verification-key", timestamp);
    const response = await request.post("/api/webhooks/sendgrid", {
      data: "[]",
      headers: {
        "x-twilio-email-event-webhook-signature": badSig,
        "x-twilio-email-event-webhook-timestamp": timestamp,
      },
    });
    expect(response.status()).toBe(401);
  });
});

test.describe("POST /api/webhooks/twilio", () => {
  const FORM_BODY = "MessageSid=SM123&MessageStatus=delivered";

  test("no signature headers -> 401", async ({ request }) => {
    const response = await request.post("/api/webhooks/twilio", { data: FORM_BODY });
    expect(response.status()).toBe(401);
  });

  test("bad signature -> 401", async ({ request }) => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const response = await request.post("/api/webhooks/twilio", {
      data: FORM_BODY,
      headers: {
        "x-twilio-signature": Buffer.from("not-a-real-signature").toString("hex"),
        "x-twilio-request-timestamp": timestamp,
      },
    });
    expect(response.status()).toBe(401);
  });

  test("well-formed but wrong-secret signature -> 401", async ({ request }) => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const badSig = signTimestampedHmac(FORM_BODY, "not-the-real-auth-token", timestamp);
    const response = await request.post("/api/webhooks/twilio", {
      data: FORM_BODY,
      headers: {
        "x-twilio-signature": badSig,
        "x-twilio-request-timestamp": timestamp,
      },
    });
    expect(response.status()).toBe(401);
  });
});

test.describe("POST /api/webhooks/resend", () => {
  test("no svix signature headers -> 401", async ({ request }) => {
    const response = await request.post("/api/webhooks/resend", { data: RAW_BODY });
    expect(response.status()).toBe(401);
  });

  test("bad svix signature -> 401", async ({ request }) => {
    const response = await request.post("/api/webhooks/resend", {
      data: RAW_BODY,
      headers: {
        "svix-id": "msg_test",
        "svix-timestamp": String(Math.floor(Date.now() / 1000)),
        "svix-signature": "v1,not-a-real-signature",
      },
    });
    expect(response.status()).toBe(401);
  });
});

test.describe("webhook env sanity", () => {
  // Fails loudly (rather than the webhooks silently accepting unsigned
  // payloads) if the dummy secrets this spec relies on aren't configured on
  // the running server.
  test("webhook secrets are configured for this run", () => {
    expect(getWebhookSecret("stripe")).toBeTruthy();
    expect(getWebhookSecret("sendgrid")).toBeTruthy();
    expect(getWebhookSecret("twilio")).toBeTruthy();
    expect(getWebhookSecret("resend")).toBeTruthy();
  });
});
