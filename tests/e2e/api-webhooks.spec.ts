import { expect, test } from "@playwright/test";

import { Webhook } from "svix";

import { queryTenantDb, signStripeWebhook, signTwilioWebhook } from "./fixtures/api";
import { getAppUrl, getWebhookSecret } from "./fixtures/env";

/**
 * Contract tests for the four provider webhook routes (see
 * tests/coverage-manifest.json -> routes -> auth: "webhook"). CI/local set
 * each verification secret to a dummy value; every route rejects unsigned,
 * badly signed and (Stripe) replayed requests. S2 adds happy paths for the
 * schemes a test can sign — Stripe, Twilio and Resend (SendGrid's is an ECDSA
 * key pair whose private half only SendGrid holds; its happy path is a unit
 * test) — and checks that a signed bounce or STOP really writes a
 * suppression (F4: those writes used to fail as anon).
 */

// Seed church id — supabase/seed.sql, Grace Harbor Church.
const CHURCH_ID = "11111111-0000-0000-0000-000000000001";

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

  test("correctly signed but more than five minutes old (a replay) -> 401; fresh -> 200", async ({ request }) => {
    const secret = getWebhookSecret("stripe");
    const stale = await request.post("/api/webhooks/stripe", {
      data: RAW_BODY,
      headers: { "stripe-signature": signStripeWebhook(RAW_BODY, secret, Math.floor(Date.now() / 1000) - 600) },
    });
    expect(stale.status()).toBe(401);
    const fresh = await request.post("/api/webhooks/stripe", {
      data: RAW_BODY,
      headers: { "stripe-signature": signStripeWebhook(RAW_BODY, secret) },
    });
    expect(fresh.status()).toBe(200);
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

test.describe("POST /api/webhooks/stripe — a signed payment marks the registration paid (S4)", () => {
  // The Supabase path wrote updated_at, a column event_registrations doesn't
  // have, and ignored the error: a real paid registration never became paid.
  test("payment_intent.succeeded -> registration paid, payment succeeded", async ({ request }) => {
    const EVENT_ID = "77777777-0000-0000-0000-000000000001";
    const paymentIntentId = `pi_e2e_${Date.now()}`;
    const registration = await queryTenantDb<{ id: string }>(
      `insert into public.event_registrations (event_id, church_id, registrant_name, payment_status)
       values ($1, $2, 'S4 Stripe e2e', 'pending') returning id`,
      [EVENT_ID, CHURCH_ID],
    );
    const registrationId = registration.rows[0].id;
    await queryTenantDb(
      `insert into public.event_registration_payments (registration_id, event_id, church_id, status, payment_intent_id, amount_cents)
       values ($1, $2, $3, 'pending', $4, 2500)`,
      [registrationId, EVENT_ID, CHURCH_ID, paymentIntentId],
    );
    try {
      const body = JSON.stringify({
        type: "payment_intent.succeeded",
        data: {
          object: {
            id: paymentIntentId,
            amount: 2500,
            currency: "usd",
            metadata: { church_id: CHURCH_ID, event_registration_id: registrationId, purpose: "event_registration" },
          },
        },
      });
      const response = await request.post("/api/webhooks/stripe", {
        data: body,
        headers: { "content-type": "application/json", "stripe-signature": signStripeWebhook(body, getWebhookSecret("stripe")) },
      });
      expect(response.status()).toBe(200);
      expect(await response.json()).toEqual({ received: true });

      const { rows } = await queryTenantDb<{ payment_status: string; amount_paid_cents: number; status: string }>(
        `select r.payment_status, r.amount_paid_cents, p.status
           from public.event_registrations r
           join public.event_registration_payments p on p.registration_id = r.id
          where r.id = $1`,
        [registrationId],
      );
      expect(rows).toEqual([{ payment_status: "paid", amount_paid_cents: 2500, status: "succeeded" }]);
    } finally {
      await queryTenantDb("delete from public.event_registration_payments where registration_id = $1", [registrationId]);
      await queryTenantDb("delete from public.event_registrations where id = $1", [registrationId]);
    }
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

  test("signature from another key -> 401", async ({ request }) => {
    const { generateKeyPairSync, sign } = await import("node:crypto");
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const response = await request.post("/api/webhooks/sendgrid", {
      data: "[]",
      headers: {
        "x-twilio-email-event-webhook-signature": sign("sha256", Buffer.from(timestamp + "[]"), privateKey).toString("base64"),
        "x-twilio-email-event-webhook-timestamp": timestamp,
      },
    });
    expect(response.status()).toBe(401);
  });
});

test.describe("POST /api/webhooks/twilio", () => {
  const FORM_BODY = "MessageSid=SM123&MessageStatus=delivered";
  const url = () => `${getAppUrl()}/api/webhooks/twilio`;

  test("no signature header -> 401", async ({ request }) => {
    const response = await request.post("/api/webhooks/twilio", {
      data: FORM_BODY,
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
    expect(response.status()).toBe(401);
  });

  test("signed with another auth token -> 401", async ({ request }) => {
    const response = await request.post("/api/webhooks/twilio", {
      data: FORM_BODY,
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-twilio-signature": signTwilioWebhook(url(), FORM_BODY, "not-the-real-auth-token"),
      },
    });
    expect(response.status()).toBe(401);
  });

  test("a signed 'replied STOP' (21610) callback writes an SMS suppression (S2, F4)", async ({ request }) => {
    const sid = `SM-e2e-${Date.now()}`;
    const phone = `+1555${String(Date.now()).slice(-7)}`;
    const log = await queryTenantDb<{ id: string }>(
      `insert into public.communication_logs (church_id, channel, subject, status, provider_message_id)
       values ($1, 'sms', 'S2 e2e', 'sent', $2) returning id`,
      [CHURCH_ID, sid],
    );
    try {
      const body = new URLSearchParams({ MessageSid: sid, MessageStatus: "undelivered", ErrorCode: "21610", To: phone }).toString();
      const post = () =>
        request.post("/api/webhooks/twilio", {
          data: body,
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            "x-twilio-signature": signTwilioWebhook(url(), body, getWebhookSecret("twilio")),
          },
        });
      const response = await post();
      expect(response.status()).toBe(200);
      expect(await response.json()).toEqual({ ok: true, recorded: true });

      // Twilio retries the same callback: recognised, not recorded twice.
      const retry = await post();
      expect(await retry.json()).toEqual({ ok: true, recorded: false });
      const events = await queryTenantDb(
        `select count(*)::int as n from public.communication_delivery_events where communication_log_id = $1`,
        [log.rows[0].id],
      );
      expect(events.rows[0].n).toBe(1);

      const suppression = await queryTenantDb(
        `select reason from public.communication_suppressions where church_id = $1 and channel = 'sms' and contact = $2`,
        [CHURCH_ID, phone],
      );
      expect(suppression.rows).toEqual([{ reason: "unsubscribe" }]);
    } finally {
      await queryTenantDb(`delete from public.communication_suppressions where church_id = $1 and contact = $2`, [CHURCH_ID, phone]);
      await queryTenantDb(`delete from public.communication_delivery_events where communication_log_id = $1`, [log.rows[0].id]);
      await queryTenantDb(`delete from public.communication_logs where id = $1`, [log.rows[0].id]);
    }
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

test.describe("POST /api/webhooks/resend — signed bounce (S2, F4)", () => {
  test("a signed bounce for a sent email writes the delivery event and an email suppression", async ({ request }) => {
    const emailId = `re-e2e-${Date.now()}`;
    const address = `bounce-${Date.now()}@example.test`;
    const log = await queryTenantDb<{ id: string }>(
      `insert into public.communication_logs (church_id, channel, subject, status, provider_message_id)
       values ($1, 'email', 'S2 e2e', 'sent', $2) returning id`,
      [CHURCH_ID, emailId],
    );
    try {
      const payload = JSON.stringify({
        type: "email.bounced",
        created_at: new Date().toISOString(),
        data: { email_id: emailId, to: [address], bounce: { message: "Mailbox does not exist" } },
      });
      const msgId = `msg_${Date.now()}`;
      const timestamp = new Date();
      const signature = new Webhook(getWebhookSecret("resend")).sign(msgId, timestamp, payload);
      const response = await request.post("/api/webhooks/resend", {
        data: payload,
        headers: {
          "content-type": "application/json",
          "svix-id": msgId,
          "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
          "svix-signature": signature,
        },
      });
      expect(response.status()).toBe(200);
      expect(await response.json()).toEqual({ ok: true, recorded: true });

      const suppression = await queryTenantDb(
        `select reason from public.communication_suppressions where church_id = $1 and channel = 'email' and contact = $2`,
        [CHURCH_ID, address],
      );
      expect(suppression.rows).toEqual([{ reason: "bounce" }]);
      const events = await queryTenantDb(
        `select status from public.communication_delivery_events where communication_log_id = $1`,
        [log.rows[0].id],
      );
      expect(events.rows).toEqual([{ status: "bounced" }]);
    } finally {
      await queryTenantDb(`delete from public.communication_suppressions where church_id = $1 and contact = $2`, [CHURCH_ID, address]);
      await queryTenantDb(`delete from public.communication_delivery_events where communication_log_id = $1`, [log.rows[0].id]);
      await queryTenantDb(`delete from public.communication_logs where id = $1`, [log.rows[0].id]);
    }
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
