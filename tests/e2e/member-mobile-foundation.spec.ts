import { expect, test } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const envFiles = [".env", ".env.local", ".demo-credentials.local"];

for (const file of envFiles) {
  const path = resolve(process.cwd(), file);
  if (!existsSync(path)) continue;

  const contents = readFileSync(path, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (process.env[key]) continue;

    process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }
}

const memberEmail = process.env.CHURCHCORE_OPS_DEMO_MEMBER_EMAIL;
const demoPassword = process.env.CHURCHCORE_OPS_DEV_PASSWORD;

const memberMobileRoutes = [
  "/app/member",
  "/app/member/schedule",
  "/app/member/groups",
  "/app/member/directory",
  "/app/member/family",
  "/app/member/giving",
  "/app/member/ministries",
  "/app/member/data-rights",
] as const;

async function signIn(page: import("@playwright/test").Page, email: string) {
  await page.goto("/sign-in?redirectTo=%2Fapp");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(demoPassword ?? "");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/app");
}

async function setChurchContext(
  page: import("@playwright/test").Page,
  roleId: "member",
) {
  await page.evaluate(
    ({ appContext }) => {
      document.cookie = `churchcore_ops_app_context=${encodeURIComponent(
        JSON.stringify(appContext),
      )}; path=/; SameSite=Lax`;
    },
    {
      appContext: {
        kind: "church",
        churchId: "11111111-0000-0000-0000-000000000001",
        roleId,
        source: "impersonation",
      },
    },
  );
}

function routeKey(route: string) {
  return route.replaceAll("/", "-").replace(/^-+/, "") || "root";
}

test.describe("Member mobile PWA foundation baseline", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    test.skip(
      !memberEmail || !demoPassword,
      "Run npm run setup:local first so .demo-credentials.local contains member credentials.",
    );

    await signIn(page, memberEmail);
    await setChurchContext(page, "member");
  });

  test("renders member routes in a phone viewport with shell controls and no obvious overflow", async ({ page }, testInfo) => {
    for (const route of memberMobileRoutes) {
      await page.goto(route);

      expect(new URL(page.url()).pathname).not.toBe("/sign-in");
      await expect(page.getByLabel("Toggle navigation")).toBeVisible();
      await expect(page.locator("footer")).toBeVisible();
      await expect(page.locator("footer a")).toHaveCount(5);
      await expect(page.getByText("Application error", { exact: false })).toHaveCount(0);

      const hasHorizontalOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth + 1;
      });
      expect(hasHorizontalOverflow).toBe(false);

      const screenshot = await page.screenshot({ fullPage: true });
      await testInfo.attach(`mobile-${routeKey(route)}`, {
        body: screenshot,
        contentType: "image/png",
      });
    }
  });

  test("renders calendar at phone viewport for member context without crashing", async ({ page }, testInfo) => {
    await page.goto("/app/calendar");

    expect(new URL(page.url()).pathname).toBe("/app/calendar");
    await expect(page.getByLabel("Toggle navigation")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Calendar" })).toBeVisible();
    await expect(page.locator("footer a")).toHaveCount(5);
    await expect(page.getByText("Application error", { exact: false })).toHaveCount(0);

    const screenshot = await page.screenshot({ fullPage: true });
    await testInfo.attach("mobile-calendar", {
      body: screenshot,
      contentType: "image/png",
    });
  });

  test("denies member access to ChurchAdmin-only readiness routes on mobile", async ({ page }) => {
    await page.goto("/app/church-admin/readiness");

    await expect(page.getByRole("heading", { name: "Weekly readiness" })).toHaveCount(0);
    expect(new URL(page.url()).pathname).not.toBe("/app/church-admin/readiness");
  });
});
