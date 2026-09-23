import { expect, test } from "@playwright/test";

import { cronAuthHeaders } from "./fixtures/api";
import { getCronSecret } from "./fixtures/env";

/**
 * Contract tests for the three cron routes (see tests/coverage-manifest.json
 * -> routes -> auth: "cron"):
 *   GET /api/cron/shepherd-ai
 *   GET /api/cron/communications-retry
 *   GET /api/cron/communications-scheduled
 *
 * All three share the exact same isAuthorizedCronRequest() gate (Authorization:
 * Bearer <secret> OR x-cron-secret: <secret>) — see each route.ts.
 */

const CRON_ROUTES = [
  "/api/cron/shepherd-ai",
  "/api/cron/communications-retry",
  "/api/cron/communications-scheduled",
] as const;

for (const route of CRON_ROUTES) {
  test.describe(`GET ${route} — rejection contract`, () => {
    test("no auth header -> 401", async ({ request }) => {
      const response = await request.get(route);
      expect(response.status()).toBe(401);
    });

    test("wrong secret, Authorization: Bearer -> 401", async ({ request }) => {
      const response = await request.get(route, {
        headers: cronAuthHeaders("not-the-real-secret", "bearer"),
      });
      expect(response.status()).toBe(401);
    });

    test("wrong secret, x-cron-secret -> 401", async ({ request }) => {
      const response = await request.get(route, {
        headers: cronAuthHeaders("not-the-real-secret", "x-cron-secret"),
      });
      expect(response.status()).toBe(401);
    });
  });

  test.describe(`GET ${route} — happy path`, () => {
    test("valid secret via Authorization: Bearer -> 200 or 207", async ({ request }) => {
      const response = await request.get(route, {
        headers: cronAuthHeaders(getCronSecret(), "bearer"),
      });
      expect([200, 207]).toContain(response.status());
      const body = await response.json();
      expect(body).not.toHaveProperty("error");
    });

    test("valid secret via x-cron-secret -> 200 or 207", async ({ request }) => {
      const response = await request.get(route, {
        headers: cronAuthHeaders(getCronSecret(), "x-cron-secret"),
      });
      expect([200, 207]).toContain(response.status());
    });
  });
}

test.describe("cron idempotency", () => {
  // /api/cron/shepherd-ai's response includes a processedAt timestamp that
  // legitimately differs between calls, so it's excluded before comparison —
  // idempotency here means "the stable, non-timestamp fields don't drift",
  // not literal byte-for-byte equality.
  function stripVolatileFields(body: Record<string, unknown>) {
    const stable = { ...body };
    delete stable.processedAt;
    return stable;
  }

  for (const route of CRON_ROUTES) {
    test(`${route} — re-running with a valid secret is idempotent`, async ({ request }) => {
      const first = await request.get(route, { headers: cronAuthHeaders(getCronSecret()) });
      expect([200, 207]).toContain(first.status());
      const firstBody = await first.json();

      const second = await request.get(route, { headers: cronAuthHeaders(getCronSecret()) });
      expect([200, 207]).toContain(second.status());
      const secondBody = await second.json();

      // A re-run must not blow up or newly report failures that weren't
      // there before — the routes are built around optimistic locks /
      // "already processed" checks specifically so overlapping or repeated
      // runs are safe.
      expect(second.status()).toBe(first.status());
      expect(stripVolatileFields(secondBody)).toEqual(stripVolatileFields(firstBody));
    });
  }
});
