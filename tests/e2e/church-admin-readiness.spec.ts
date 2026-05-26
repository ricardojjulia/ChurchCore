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
const demoPassword = process.env.CHURCHCORE_OPS_DEV_PASSWORD;

const readinessTargets = [
  { route: "/app/church-admin/settings", text: "Church setup" },
  { route: "/app/church-admin/accounts?status=pending", text: "Approval queue" },
  { route: "/app/church-admin/people?view=incomplete-profiles", text: "Readiness view" },
  {
    route: "/app/church-admin/people?view=unassigned-households&household=unassigned",
    text: "Readiness view",
  },
  { route: "/app/church-admin/events?view=needs-roster", text: "Readiness view" },
  { route: "/app/church-admin/children/dashboard?view=readiness", text: "Volunteers" },
  { route: "/app/church-admin/volunteers/schedules?view=unassigned", text: "Service Plans" },
  { route: "/app/church-admin/giving?view=exceptions", text: "Post to GL" },
  { route: "/app/church-admin/finance/journals?view=drafts", text: "Readiness view" },
  { route: "/app/communications?view=readiness", text: "Communications Hub" },
  { route: "/app/reports?range=90d", text: "Reports" },
  { route: "/app/church-admin/workflows?status=open", text: "Readiness view" },
] as const;

test.describe("ChurchAdmin weekly readiness browser path", () => {
  test.beforeEach(async ({ page, context }) => {
    test.skip(
      !adminEmail || !demoPassword,
      "Run npm run setup:local first so .demo-credentials.local contains demo credentials.",
    );

    await page.goto("/sign-in?redirectTo=%2Fapp");
    await page.getByLabel("Email").fill(adminEmail);
    await page.getByRole("textbox", { name: "Password" }).fill(demoPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/app");

    await context.addCookies([
      {
        name: "churchcore_ops_app_context",
        value: JSON.stringify({
          kind: "church",
          churchId: "11111111-0000-0000-0000-000000000001",
          roleId: "church-admin",
          source: "impersonation",
        }),
        url: appUrl,
      },
    ]);
  });

  test("opens readiness and every current readiness target route", async ({ page }) => {
    await page.goto("/app/church-admin/readiness");
    await expect(page.getByRole("heading", { name: "Weekly readiness" })).toBeVisible();

    for (const target of readinessTargets) {
      await page.goto(target.route);
      expect(new URL(page.url()).pathname).not.toBe("/sign-in");
      await expect(page.getByText(target.text, { exact: false }).first()).toBeVisible();
      await expect(page.getByText("Application error", { exact: false })).toHaveCount(0);
    }
  });
});
