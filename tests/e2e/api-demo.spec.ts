import { expect, test } from "@playwright/test";

import { queryTenantDb } from "./fixtures/api";

// Seed church and event — supabase/seed.sql (Grace Harbor).
const CHURCH_ID = "11111111-0000-0000-0000-000000000001";
const EVENT_ID = "77777777-0000-0000-0000-000000000001";

/**
 * Contract tests for the two demo-gated routes (see
 * tests/coverage-manifest.json -> routes -> auth: "public", demo-gated):
 *   POST /api/demo/complete-payment
 *   POST /api/demo/feedback
 *
 * Both start with `if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true") return 403`,
 * so they're only reachable in demo mode — this run enables it explicitly.
 */

test.describe("POST /api/demo/complete-payment", () => {
  test("missing registrationId/churchId -> 400", async ({ request }) => {
    const response = await request.post("/api/demo/complete-payment", { data: {} });
    expect(response.status()).toBe(400);
  });

  test("invalid JSON -> 400", async ({ request }) => {
    const response = await request.post("/api/demo/complete-payment", {
      headers: { "content-type": "application/json" },
      data: "not json",
    });
    expect(response.status()).toBe(400);
  });
});

test.describe("POST /api/demo/complete-payment — only stubbed payments (S4)", () => {
  async function pendingRegistration(paymentIntentId: (registrationId: string) => string) {
    const registration = await queryTenantDb<{ id: string }>(
      `insert into public.event_registrations (event_id, church_id, registrant_name, payment_status)
       values ($1, $2, 'S4 e2e', 'pending') returning id`,
      [EVENT_ID, CHURCH_ID],
    );
    const id = registration.rows[0].id;
    await queryTenantDb(
      `insert into public.event_registration_payments (registration_id, event_id, church_id, status, payment_intent_id)
       values ($1, $2, $3, 'pending', $4)`,
      [id, EVENT_ID, CHURCH_ID, paymentIntentId(id)],
    );
    return id;
  }

  async function paymentStatus(registrationId: string) {
    const { rows } = await queryTenantDb<{ payment_status: string }>(
      "select payment_status from public.event_registrations where id = $1",
      [registrationId],
    );
    return rows[0].payment_status;
  }

  async function cleanUp(registrationId: string) {
    await queryTenantDb("delete from public.event_registration_payments where registration_id = $1", [registrationId]);
    await queryTenantDb("delete from public.event_registrations where id = $1", [registrationId]);
  }

  test("completes a pending stub payment", async ({ request }) => {
    const registrationId = await pendingRegistration((id) => `pi_event_registration_stub_${id}`);
    try {
      const response = await request.post("/api/demo/complete-payment", { data: { registrationId, churchId: CHURCH_ID } });
      expect(response.status()).toBe(200);
      expect(await paymentStatus(registrationId)).toBe("paid");
    } finally {
      await cleanUp(registrationId);
    }
  });

  test("won't mark a registration with a real Stripe payment as paid -> 404", async ({ request }) => {
    const registrationId = await pendingRegistration(() => `pi_3Real${Date.now()}`);
    try {
      const response = await request.post("/api/demo/complete-payment", { data: { registrationId, churchId: CHURCH_ID } });
      expect(response.status()).toBe(404);
      expect(await paymentStatus(registrationId)).toBe("pending");
    } finally {
      await cleanUp(registrationId);
    }
  });
});

test.describe("POST /api/demo/feedback", () => {
  test("invalid JSON -> 400", async ({ request }) => {
    const response = await request.post("/api/demo/feedback", {
      headers: { "content-type": "application/json" },
      data: "not json",
    });
    expect(response.status()).toBe(400);
  });

  test("missing required fields -> 400", async ({ request }) => {
    const response = await request.post("/api/demo/feedback", { data: {} });
    expect(response.status()).toBe(400);
  });
});
