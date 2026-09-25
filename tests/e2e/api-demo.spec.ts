import { expect, test } from "@playwright/test";

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
