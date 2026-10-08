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
  // S3: requireChurchSession now runs outside the handler's try/catch, so its
  // redirect reaches Next instead of being swallowed into a 500 (the bug this
  // test used to pin; Next's redirect docs: call it outside try/catch in
  // Route Handlers).
  test("-> 307 redirect to /sign-in", async ({ request }) => {
    const response = await request.get("/api/reports/custom", { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(response.headers()["location"]).toContain("/sign-in");
  });
});

// ── Signed in: graceful behavior without optional provider keys ─────────────
// CI and `npm run test:e2e:local` run with ANTHROPIC_API_KEY and the VAPID
// keys unset, so these assert the stub/graceful paths the routes promise.

test.describe("session routes — signed in as member", () => {
  test.use({ storageState: authFilePath("member") });

  test("POST /api/ai -> 403: the HQ advisor is platform staff only (S5, Council Review 27)", async ({ page }) => {
    const response = await page.request.post("/api/ai", { data: { prompt: "hello" } });
    expect(response.status()).toBe(403);
    expect(await response.json()).toEqual({ error: "Forbidden" });
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

// ── /api/church-admin/imports/[batchId]/report (G4.2 reconciliation CSV) ─────

const IMPORT_REPORT_PATH = "/api/church-admin/imports/00000000-0000-0000-0000-00000000dead/report";

test.describe("GET /api/church-admin/imports/[batchId]/report — signed out", () => {
  test("-> 307 redirect to /sign-in", async ({ request }) => {
    const response = await request.get(IMPORT_REPORT_PATH, { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(response.headers()["location"]).toContain("/sign-in");
  });
});

for (const identity of ["member", "secretary", "pastor", "ministry-leader"] as const) {
  test.describe(`GET /api/church-admin/imports/[batchId]/report — signed in as ${identity}`, () => {
    test.use({ storageState: authFilePath(identity) });

    test("-> 403, no data", async ({ page }) => {
      const response = await page.request.get(IMPORT_REPORT_PATH, { maxRedirects: 0 });
      expect(response.status()).toBe(403);
      expect(await response.json()).toEqual({ error: "Unauthorized" });
    });
  });
}

test.describe("GET /api/church-admin/imports/[batchId]/report — signed in as church admin", () => {
  test.use({ storageState: authFilePath("church-admin") });

  test("an unknown batch id and a malformed id -> 404", async ({ page }) => {
    expect((await page.request.get(IMPORT_REPORT_PATH, { maxRedirects: 0 })).status()).toBe(404);
    expect((await page.request.get("/api/church-admin/imports/not-a-uuid/report", { maxRedirects: 0 })).status()).toBe(404);
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

  // S3: these read through the pastor's own Supabase client (RLS). Events used
  // to fail outright (it asked for start/"end" columns that don't exist).
  test("events -> CSV with the real starts_at/ends_at columns", async ({ page }) => {
    const response = await page.request.get("/api/reports/custom?entity=events");
    expect(response.status()).toBe(200);
    const [header, ...rows] = (await response.text()).trim().split("\n");
    expect(header).toBe("id,title,description,starts_at,ends_at,category,created_at");
    expect(rows.length).toBeGreaterThan(0);
  });

  test("giving -> CSV that shows an anonymous gift's donor as Anonymous (Council Review 30)", async ({ page }) => {
    const { rows } = await queryTenantDb<{ id: string }>(
      "select id from public.donations where church_id = $1 and is_anonymous and donor_name is not null limit 1",
      [SEED_CHURCH_ID],
    );
    expect(rows).toHaveLength(1);

    const response = await page.request.get("/api/reports/custom?entity=giving");
    expect(response.status()).toBe(200);
    const lines = (await response.text()).split("\n");
    expect(lines[0]).toContain("is_anonymous");
    const anonymousLine = lines.find((line) => line.startsWith(`${rows[0].id},`));
    // Name shown as Anonymous, email blank, on this gift (the same donor's
    // non-anonymous gifts, if any, legitimately keep their name).
    expect(anonymousLine).toMatch(new RegExp(`^${rows[0].id},Anonymous,,true,`));
  });
});

// ── Control-plane routes reject tenant roles ─────────────────────────────────

test.describe("control-plane routes — signed in as a tenant role", () => {
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

// ── Stripe Connect onboarding (G3.0b, ADR 0025) ──────────────────────────────
// CI runs without Stripe keys, so "start" can't reach Stripe and the callback
// can't verify a state; these pin who may use the routes and that a forged
// callback links nothing.

test.describe("Stripe Connect routes — signed out", () => {
  for (const path of ["/api/stripe/connect/start", "/api/stripe/connect/callback?code=ac_x&state=forged"]) {
    test(`GET ${path.split("?")[0]} -> redirect to /sign-in`, async ({ request }) => {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status()).toBe(307);
      expect(response.headers()["location"]).toContain("/sign-in");
    });
  }
});

for (const identity of ["pastor", "secretary", "member"] as const) {
  test.describe(`Stripe Connect routes — signed in as ${identity}`, () => {
    test.use({ storageState: authFilePath(identity) });

    test("start -> 403: only a church admin connects the church's account", async ({ page }) => {
      const response = await page.request.get("/api/stripe/connect/start", { maxRedirects: 0 });
      expect(response.status()).toBe(403);
    });
  });
}

test.describe("Stripe Connect routes — signed in as church-admin", () => {
  test.use({ storageState: authFilePath("church-admin") });

  test("start -> to Stripe's OAuth page, or back to settings when the platform isn't set up for Connect", async ({ page }) => {
    const response = await page.request.get("/api/stripe/connect/start", { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(response.headers()["location"]).toMatch(
      /^https:\/\/connect\.stripe\.com\/oauth\/authorize\?|\/app\/church-admin\/giving\?stripe=not_configured$/,
    );
  });

  test("a callback with a forged state links nothing", async ({ page }) => {
    const response = await page.request.get("/api/stripe/connect/callback?code=ac_forged&state=forged.signature", {
      maxRedirects: 0,
    });
    expect(response.status()).toBe(307);
    expect(response.headers()["location"]).toContain("/app/church-admin/giving?stripe=invalid");
    const { rows } = await queryTenantDb("select 1 from public.church_payment_accounts where church_id = $1", [SEED_CHURCH_ID]);
    expect(rows).toHaveLength(0);
  });

  test("a callback Stripe sends back declined -> cancelled", async ({ page }) => {
    const response = await page.request.get("/api/stripe/connect/callback?error=access_denied&state=x", { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(response.headers()["location"]).toContain("/app/church-admin/giving?stripe=cancelled");
  });
});

// ── Giving statements (G3.3) ─────────────────────────────────────────────────
// Both routes call requireChurchSession outside any try, so a signed-out caller
// is redirected to /sign-in (307), never a 500. The admin route is church-admin
// only; the member route has no donor parameter and serves any signed-in member.

const STATEMENT_RANGE = "start=2025-01-01&end=2025-12-31";
const STATEMENT_PDF = `/api/giving/statements/pdf?donor=p:00000000-0000-0000-0000-000000000000&${STATEMENT_RANGE}`;

test.describe("giving statement routes — signed out", () => {
  for (const path of [STATEMENT_PDF, "/api/member/giving-statement?year=2025"]) {
    test(`GET ${path.split("?")[0]} -> redirect to /sign-in`, async ({ request }) => {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status()).toBe(307);
      expect(response.headers()["location"]).toContain("/sign-in");
    });
  }
});

for (const identity of ["pastor", "secretary", "ministry-leader", "member"] as const) {
  test.describe(`GET /api/giving/statements/pdf — signed in as ${identity}`, () => {
    test.use({ storageState: authFilePath(identity) });

    test("-> 403: only a church admin downloads donor statements", async ({ page }) => {
      const response = await page.request.get(STATEMENT_PDF, { maxRedirects: 0 });
      expect(response.status()).toBe(403);
      expect(response.headers()["content-type"]).not.toContain("application/pdf");
      expect(await response.json()).toEqual({ error: "Unauthorized" });
    });
  });
}

test.describe("GET /api/giving/statements/pdf — signed in as church-admin", () => {
  test.use({ storageState: authFilePath("church-admin") });

  test("a missing donor -> 400, an unknown donor -> 404, an invalid range -> 400", async ({ page }) => {
    expect((await page.request.get(`/api/giving/statements/pdf?${STATEMENT_RANGE}`)).status()).toBe(400);
    expect((await page.request.get(STATEMENT_PDF)).status()).toBe(404);
    expect(
      (await page.request.get("/api/giving/statements/pdf?donor=p:00000000-0000-0000-0000-000000000000&start=2025-12-31&end=2025-01-01")).status(),
    ).toBe(400);
    expect((await page.request.get("/api/giving/statements/pdf?donor=p:not-a-uuid&start=2025-01-01&end=2025-12-31")).status()).toBe(404);
  });
});

for (const identity of ["church-admin", "pastor", "secretary", "ministry-leader", "member"] as const) {
  test.describe(`GET /api/member/giving-statement — signed in as ${identity}`, () => {
    test.use({ storageState: authFilePath(identity) });

    test("a year with no gifts -> 404 JSON (never an empty PDF); a bad year -> 400", async ({ page }) => {
      const none = await page.request.get("/api/member/giving-statement?year=2001", { maxRedirects: 0 });
      expect([404, 403]).toContain(none.status());
      expect(none.headers()["content-type"]).not.toContain("application/pdf");
      expect((await page.request.get("/api/member/giving-statement?year=nope", { maxRedirects: 0 })).status()).toBe(
        none.status() === 403 ? 403 : 400,
      );
    });
  });
}
