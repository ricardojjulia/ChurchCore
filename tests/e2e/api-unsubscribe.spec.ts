import { expect, test } from "@playwright/test";

import { queryTenantDb, uniqueTestIp, unsubscribeQueryString } from "./fixtures/api";
import { getUnsubscribeSecret } from "./fixtures/env";

/**
 * Contract tests for GET /api/unsubscribe (see tests/coverage-manifest.json
 * -> routes -> auth: "hmac"). Every request below uses a fresh
 * x-forwarded-for so tests don't consume each other's rate-limit budget
 * (isRateLimited keys on `unsubscribe:${ip}`, 15 requests / 60s — see
 * lib/rate-limit.ts and app/api/unsubscribe/route.ts).
 */

// Seed church id — supabase/seed.sql, Grace Harbor Church.
const CHURCH_ID = "11111111-0000-0000-0000-000000000001";

test.describe("GET /api/unsubscribe — rejection contract", () => {
  test("missing params -> 400", async ({ request }) => {
    const response = await request.get("/api/unsubscribe", {
      headers: { "x-forwarded-for": uniqueTestIp() },
    });
    expect(response.status()).toBe(400);
  });

  test("expired token -> 400", async ({ request }) => {
    const qs = unsubscribeQueryString({
      churchId: CHURCH_ID,
      contactEmail: "expired-token-test@example.com",
      channel: "email",
      secret: getUnsubscribeSecret(),
      expiresAt: Date.now() - 60_000,
    });
    const response = await request.get(`/api/unsubscribe?${qs}`, {
      headers: { "x-forwarded-for": uniqueTestIp() },
    });
    expect(response.status()).toBe(400);
    expect(await response.text()).toContain("expired");
  });

  test("bad signature -> 400", async ({ request }) => {
    const qs = unsubscribeQueryString({
      churchId: CHURCH_ID,
      contactEmail: "bad-sig-test@example.com",
      channel: "email",
      secret: "not-the-real-unsubscribe-secret",
    });
    const response = await request.get(`/api/unsubscribe?${qs}`, {
      headers: { "x-forwarded-for": uniqueTestIp() },
    });
    expect(response.status()).toBe(400);
  });

  test("bad channel -> 400", async ({ request }) => {
    const expiresAt = Date.now() + 60_000;
    const params = new URLSearchParams({
      t: String(expiresAt),
      cid: CHURCH_ID,
      e: "bad-channel-test@example.com",
      ch: "phone",
      sig: "deadbeef",
    });
    const response = await request.get(`/api/unsubscribe?${params.toString()}`, {
      headers: { "x-forwarded-for": uniqueTestIp() },
    });
    expect(response.status()).toBe(400);
  });
});

test.describe("GET /api/unsubscribe — happy path", () => {
  test("a valid signed link suppresses the contact and a second call is idempotent", async ({
    request,
  }) => {
    const contactEmail = `unsubscribe-happy-path-${Date.now()}@example.com`;
    const ip = uniqueTestIp();
    const qs = unsubscribeQueryString({
      churchId: CHURCH_ID,
      contactEmail,
      channel: "email",
      secret: getUnsubscribeSecret(),
    });

    const first = await request.get(`/api/unsubscribe?${qs}`, {
      headers: { "x-forwarded-for": ip },
    });
    expect(first.status()).toBe(200);
    expect(await first.text()).toContain("unsubscribed successfully");

    const rows = await queryTenantDb(
      `select id, church_id, channel, contact, reason from public.communication_suppressions
       where church_id = $1 and channel = 'email' and contact = $2`,
      [CHURCH_ID, contactEmail.toLowerCase()],
    );
    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0]).toMatchObject({
      church_id: CHURCH_ID,
      channel: "email",
      contact: contactEmail.toLowerCase(),
      reason: "unsubscribe",
    });

    // Second call with the same link must still succeed and must not
    // create a duplicate suppression row (on conflict do nothing / ignoreDuplicates).
    const second = await request.get(`/api/unsubscribe?${qs}`, {
      headers: { "x-forwarded-for": ip },
    });
    expect(second.status()).toBe(200);

    const rowsAfterSecondCall = await queryTenantDb(
      `select id from public.communication_suppressions
       where church_id = $1 and channel = 'email' and contact = $2`,
      [CHURCH_ID, contactEmail.toLowerCase()],
    );
    expect(rowsAfterSecondCall.rowCount).toBe(1);
  });
});

test.describe("GET /api/unsubscribe — rate limit", () => {
  test("the 16th request within a minute from the same IP -> 429", async ({ request }) => {
    const ip = uniqueTestIp();

    let lastStatus = 0;
    for (let i = 0; i < 16; i++) {
      const response = await request.get("/api/unsubscribe", {
        headers: { "x-forwarded-for": ip },
      });
      lastStatus = response.status();
    }

    expect(lastStatus).toBe(429);
  });
});
