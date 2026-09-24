import { expect, test } from "@playwright/test";

import { queryTenantDb, uniqueTestIp } from "./fixtures/api";
import { getDemoCredentials } from "./fixtures/env";
import { authFilePath, SEED_CHURCH_ID } from "./fixtures/roles";

/**
 * Contract tests for the session- and control-plane-gated routes (see
 * tests/coverage-manifest.json -> routes -> auth: "session" | "control").
 * Playwright's bare `request` fixture carries no auth cookies, so every
 * case here is naturally "signed out" (AC7: "session routes -> 401 or
 * redirect when signed out").
 */

test.describe("POST /api/ai — signed out", () => {
  test("-> 401", async ({ request }) => {
    const response = await request.post("/api/ai", { data: { prompt: "hello" } });
    expect(response.status()).toBe(401);
  });
});

test.describe("POST /api/push/subscribe — signed out", () => {
  test("a well-formed body still -> 401 (auth is checked after field validation)", async ({ request }) => {
    const response = await request.post("/api/push/subscribe", {
      data: {
        subscription: {
          endpoint: "https://push.example.com/abc",
          keys: { p256dh: "p256dh-value", auth: "auth-value" },
        },
        churchId: "11111111-0000-0000-0000-000000000001",
        profileId: "00000000-0000-0000-0000-000000000000",
      },
    });
    expect(response.status()).toBe(401);
  });
});

test.describe("GET /api/control/db-health — signed out", () => {
  test("-> redirect to /sign-in", async ({ request }) => {
    const response = await request.get("/api/control/db-health", { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(response.headers()["location"]).toContain("/sign-in");
  });
});

test.describe("PATCH /api/control/demo-feedback/[id] — signed out", () => {
  test("-> redirect to /sign-in", async ({ request }) => {
    const response = await request.patch("/api/control/demo-feedback/00000000-0000-0000-0000-000000000000", {
      data: { processed: true },
      maxRedirects: 0,
    });
    expect(response.status()).toBe(307);
    expect(response.headers()["location"]).toContain("/sign-in");
  });
});

test.describe("GET /api/reports/custom — signed out", () => {
  // KNOWN APP BUG (found while writing this contract test, not fixed here
  // per this story's backend-builder scope — application code is out of
  // bounds; see the handback report):
  //
  // requireChurchSession() -> requireSession() calls next/navigation's
  // redirect(), which throws a NEXT_REDIRECT-digest error that must
  // propagate to Next's request handling to actually produce a redirect
  // response. Next's own docs (node_modules/next/dist/docs/01-app/
  // 03-api-reference/04-functions/redirect.md, "Good to know") say:
  // "In Server Actions and Route Handlers, redirect should be called
  // OUTSIDE the try block when using try/catch statements."
  //
  // app/api/reports/custom/route.ts calls requireChurchSession() INSIDE a
  // try block whose catch-all swallows the thrown redirect and returns a
  // 500 JSON body instead — unlike the sibling route
  // app/api/control/db-health/route.ts, which correctly special-cases and
  // re-throws digests starting with "NEXT_REDIRECT" before its own
  // catch-all. A signed-out request gets an unhandled-looking 500
  // ("Failed to generate report") instead of a redirect to /sign-in.
  //
  // Pinned to the bug's exact current symptom (500 with the handler's generic
  // error body), rather than test.fail(), so a different failure can't hide
  // here. When the redirect is moved out of the try/catch this assertion
  // fails; replace it with `307` + a /sign-in Location.
  test("KNOWN BUG: -> 500 instead of a /sign-in redirect", async ({ request }) => {
    const response = await request.get("/api/reports/custom", { maxRedirects: 0 });
    expect(response.status()).toBe(500);
    expect(await response.json()).toEqual({ error: "Failed to generate report" });
  });
});

// ── Signed in: graceful behavior without optional provider keys ─────────────
// CI and `npm run test:e2e:local` run with ANTHROPIC_API_KEY and the VAPID
// keys unset, so these assert the stub/graceful paths the routes promise.

test.describe("session routes — signed in as member", () => {
  test.use({ storageState: authFilePath("member") });

  test("POST /api/ai without ANTHROPIC_API_KEY -> 500 with a clear message, no crash", async ({ page }) => {
    const response = await page.request.post("/api/ai", { data: { prompt: "hello" } });
    expect(response.status()).toBe(500);
    expect(await response.json()).toEqual({ error: "AI features are not configured in this environment." });
  });

  test("POST /api/push/subscribe for the caller's own profile -> graceful skip without VAPID keys", async ({ page }) => {
    const { memberEmail } = getDemoCredentials();
    const { rows } = await queryTenantDb<{ id: string }>(
      "select p.id from public.profiles p join auth.users u on u.id = p.user_id where u.email = $1 and p.church_id = $2",
      [memberEmail, SEED_CHURCH_ID],
    );
    expect(rows).toHaveLength(1);

    const response = await page.request.post("/api/push/subscribe", {
      headers: { "x-forwarded-for": uniqueTestIp() },
      data: {
        subscription: { endpoint: "https://push.example.com/e2e", keys: { p256dh: "p256dh-value", auth: "auth-value" } },
        churchId: SEED_CHURCH_ID,
        profileId: rows[0].id,
      },
    });
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ received: true, skipped: true });
  });

  test("POST /api/push/subscribe for someone else's profile -> 403", async ({ page }) => {
    const { memberEmail } = getDemoCredentials();
    const { rows } = await queryTenantDb<{ id: string }>(
      "select p.id from public.profiles p left join auth.users u on u.id = p.user_id where p.church_id = $2 and (u.email is null or u.email <> $1) limit 1",
      [memberEmail, SEED_CHURCH_ID],
    );
    expect(rows).toHaveLength(1);

    const response = await page.request.post("/api/push/subscribe", {
      headers: { "x-forwarded-for": uniqueTestIp() },
      data: {
        subscription: { endpoint: "https://push.example.com/e2e", keys: { p256dh: "p256dh-value", auth: "auth-value" } },
        churchId: SEED_CHURCH_ID,
        profileId: rows[0].id,
      },
    });
    expect(response.status()).toBe(403);
  });
});

// ── /api/reports/custom by role (PII and donation CSV exports) ───────────────

for (const identity of ["member", "secretary", "ministry-leader"] as const) {
  test.describe(`GET /api/reports/custom — signed in as ${identity}`, () => {
    test.use({ storageState: authFilePath(identity) });

    test("-> 403, no data", async ({ page }) => {
      const response = await page.request.get("/api/reports/custom?entity=people", { maxRedirects: 0 });
      expect(response.status()).toBe(403);
      expect(await response.json()).toEqual({ error: "Unauthorized" });
    });
  });
}

test.describe("GET /api/reports/custom — signed in as pastor", () => {
  test.use({ storageState: authFilePath("pastor") });

  test("people -> CSV of this church's profiles", async ({ page }) => {
    const response = await page.request.get("/api/reports/custom?entity=people");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/csv");
    const [header, ...rows] = (await response.text()).trim().split("\n");
    expect(header).toContain("full_name");
    expect(rows.length).toBeGreaterThan(0);
  });

  test("an unknown entity -> 400", async ({ page }) => {
    const response = await page.request.get("/api/reports/custom?entity=nope");
    expect(response.status()).toBe(400);
  });
});

// ── Control-plane routes reject tenant roles ─────────────────────────────────

test.describe("control-plane routes — signed in as a tenant role (church-admin context excluded: it is a platform admin)", () => {
  test.use({ storageState: authFilePath("pastor") });

  test("GET /api/control/db-health -> redirect to /sign-in (force) for a tenant role", async ({ page }) => {
    const response = await page.request.get("/api/control/db-health", { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(response.headers()["location"]).toContain("/sign-in");
    expect(response.headers()["location"]).toContain("force=1");
  });

  test("PATCH /api/control/demo-feedback/[id] -> redirect to /sign-in (force) for a tenant role", async ({ page }) => {
    const response = await page.request.patch("/api/control/demo-feedback/00000000-0000-0000-0000-000000000000", {
      data: { status: "reviewed" },
      maxRedirects: 0,
    });
    expect(response.status()).toBe(307);
    expect(response.headers()["location"]).toContain("force=1");
  });
});
