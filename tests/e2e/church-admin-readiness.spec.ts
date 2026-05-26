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

const appUrl = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:4200";
const adminEmail = process.env.CHURCHCORE_OPS_DEMO_ADMIN_EMAIL;
const memberEmail = process.env.CHURCHCORE_OPS_DEMO_MEMBER_EMAIL;
const ministryLeaderEmail = process.env.CHURCHCORE_OPS_DEMO_MINISTRY_LEADER_EMAIL;
const pastorEmail = process.env.CHURCHCORE_OPS_DEMO_PASTOR_EMAIL;
const secretaryEmail = process.env.CHURCHCORE_OPS_DEMO_SECRETARY_EMAIL;
const demoPassword = process.env.CHURCHCORE_OPS_DEV_PASSWORD;

const readinessTargets = [
  { route: "/app/church-admin/settings", text: "Church setup", hasTargetState: true },
  { route: "/app/church-admin/accounts?status=pending", text: "Approval queue" },
  {
    route: "/app/church-admin/people?view=incomplete-profiles",
    text: "Readiness view",
    hasTargetState: true,
  },
  {
    route: "/app/church-admin/people?view=unassigned-households&household=unassigned",
    text: "Readiness view",
  },
  { route: "/app/church-admin/events?view=needs-roster", text: "Readiness view" },
  { route: "/app/church-admin/children/dashboard?view=readiness", text: "Volunteers" },
  { route: "/app/church-admin/volunteers/schedules?view=unassigned", text: "Service Plans" },
  { route: "/app/church-admin/giving?view=exceptions", text: "Post to GL", hasTargetState: true },
  { route: "/app/church-admin/finance/journals?view=drafts", text: "Readiness view" },
  { route: "/app/communications?view=readiness", text: "Communications Hub" },
  { route: "/app/reports?range=90d", text: "Reports" },
  { route: "/app/church-admin/workflows?status=open", text: "Readiness view" },
] as const;

const churchAdminOnlyReadinessRoutes = [
  { route: "/app/church-admin/readiness", deniedText: "Weekly readiness" },
  { route: "/app/church-admin/settings", deniedText: "Church setup" },
  { route: "/app/church-admin/accounts?status=pending", deniedText: "Approval queue" },
  { route: "/app/church-admin/people?view=incomplete-profiles", deniedText: "Readiness view" },
  {
    route: "/app/church-admin/people?view=unassigned-households&household=unassigned",
    deniedText: "Readiness view",
  },
  { route: "/app/church-admin/events?view=needs-roster", deniedText: "Readiness view" },
  { route: "/app/church-admin/children/dashboard?view=readiness", deniedText: "Volunteers" },
  { route: "/app/church-admin/volunteers/schedules?view=unassigned", deniedText: "Service Plans" },
  { route: "/app/church-admin/giving?view=exceptions", deniedText: "Post to GL" },
  { route: "/app/church-admin/finance/journals?view=drafts", deniedText: "Readiness view" },
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
  roleId: "church-admin" | "secretary" | "pastor" | "ministry-leader" | "member",
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

async function setControlContext(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    document.cookie = `churchcore_ops_app_context=${encodeURIComponent(
      JSON.stringify({ kind: "control" }),
    )}; path=/; SameSite=Lax`;
  });
}

async function clearAppContextCookie(context: import("@playwright/test").BrowserContext) {
  await context.addCookies([
    {
      name: "churchcore_ops_app_context",
      value: "",
      url: appUrl,
      expires: 0,
    },
  ]);
}

test.describe("ChurchAdmin weekly readiness browser path", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(
      !adminEmail || !demoPassword,
      "Run npm run setup:local first so .demo-credentials.local contains demo credentials.",
    );

    await signIn(page, adminEmail);
    await setChurchContext(page, "church-admin");
  });

  test("opens readiness and every current readiness target route", async ({ page }) => {
    await page.goto("/app/church-admin/readiness");
    await expect(page.getByRole("heading", { name: "Weekly readiness" })).toBeVisible();

    for (const target of readinessTargets) {
      await page.goto(target.route);
      expect(new URL(page.url()).pathname).not.toBe("/sign-in");
      await expect(page.getByText(target.text, { exact: false }).first()).toBeVisible();
      if ("hasTargetState" in target) {
        await expect(page.locator("[data-testid^='readiness-target-state-']")).toBeVisible();
      }
      await expect(page.getByText("Application error", { exact: false })).toHaveCount(0);
    }
  });
});

test.describe("ChurchAdmin readiness denied-role browser path", () => {
  test("redirects secretary and member users away from ChurchAdmin-only readiness routes", async ({
    page,
  }) => {
    test.skip(
      !secretaryEmail || !memberEmail || !demoPassword,
      "Run npm run setup:local first so .demo-credentials.local contains secretary and member credentials.",
    );

    for (const email of [secretaryEmail, memberEmail]) {
      await page.context().clearCookies();
      await clearAppContextCookie(page.context());
      await signIn(page, email);

      for (const { route, deniedText } of churchAdminOnlyReadinessRoutes) {
        await page.goto(route);
        await expect(page.getByRole("heading", { name: "Weekly readiness" })).toHaveCount(0);
        await expect(page.getByText(deniedText, { exact: false })).toHaveCount(0);
      }
    }
  });

  test("redirects pastor and ministry-leader users away from ChurchAdmin-only readiness routes", async ({
    page,
  }) => {
    test.skip(
      !pastorEmail || !ministryLeaderEmail || !demoPassword,
      "Run npm run setup:local first so .demo-credentials.local contains pastor and ministry leader credentials.",
    );

    for (const email of [pastorEmail, ministryLeaderEmail]) {
      await page.context().clearCookies();
      await clearAppContextCookie(page.context());
      await signIn(page, email);

      for (const { route, deniedText } of churchAdminOnlyReadinessRoutes) {
        await page.goto(route);
        await expect(page.getByRole("heading", { name: "Weekly readiness" })).toHaveCount(0);
        await expect(page.getByText(deniedText, { exact: false })).toHaveCount(0);
      }
    }
  });

  test.skip("redirects control-plane context away from ChurchAdmin-only readiness routes", async ({
    page,
  }) => {
    test.skip(
      !adminEmail || !demoPassword,
      "Run npm run setup:local first so .demo-credentials.local contains demo credentials.",
    );

    await signIn(page, adminEmail);
    await setControlContext(page);

    for (const { route, deniedText } of churchAdminOnlyReadinessRoutes) {
      await page.goto(route);
      await expect(page.getByRole("heading", { name: "Weekly readiness" })).toHaveCount(0);
      await expect(page.getByText(deniedText, { exact: false })).toHaveCount(0);
    }
  });
});
