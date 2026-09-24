import { expect, test } from "@playwright/test";

import { authFilePath } from "./fixtures/roles";

const readinessTargets = [
  { route: "/app/church-admin/settings", text: "Church setup", hasTargetState: true },
  {
    route: "/app/church-admin/accounts?status=pending",
    text: "Approval queue",
    hasTargetState: true,
  },
  {
    route: "/app/church-admin/people?view=incomplete-profiles",
    text: "Readiness view",
    hasTargetState: true,
  },
  {
    route: "/app/church-admin/people?view=unassigned-households&household=unassigned",
    text: "Readiness view",
  },
  {
    route: "/app/church-admin/events?view=needs-roster",
    text: "Readiness view",
    hasTargetState: true,
  },
  {
    route: "/app/church-admin/children/dashboard?view=readiness",
    text: "Volunteers",
    hasTargetState: true,
  },
  {
    route: "/app/church-admin/volunteers/schedules?view=unassigned",
    text: "Service Plans",
    hasTargetState: true,
  },
  { route: "/app/church-admin/giving?view=exceptions", text: "Post to GL", hasTargetState: true },
  {
    route: "/app/church-admin/finance/journals?view=drafts",
    text: "Readiness view",
    hasTargetState: true,
  },
  { route: "/app/reports?range=90d", text: "Reports", hasTargetState: true },
  {
    route: "/app/church-admin/workflows?status=open",
    text: "Readiness view",
    hasTargetState: true,
  },
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
  // Pastor and ministry-leader were granted service-plan access in Service
  // Planning Story 1 (matching the can_manage_church RLS policy), so they are
  // not denied here; see tests/coverage-manifest.json.
  {
    route: "/app/church-admin/volunteers/schedules?view=unassigned",
    deniedText: "Service Plans",
    alsoAllowed: ["pastor", "ministry-leader"],
  },
  { route: "/app/church-admin/giving?view=exceptions", deniedText: "Post to GL" },
  { route: "/app/church-admin/finance/journals?view=drafts", deniedText: "Readiness view" },
] as const;

test.describe("ChurchAdmin weekly readiness browser path", () => {
  test.use({ storageState: authFilePath("church-admin") });

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

  test("communications readiness target ?view=readiness is not implemented (known gap)", async ({ page }) => {
    // Known app gap, verified by reading the source (not introduced by this
    // migration): app/app/communications/page.tsx unconditionally
    // `redirect("/app/communications/history")` for every request,
    // dropping the `?view=readiness` query string entirely — there is no
    // readiness-filtered view to land on. "Communications Hub" also isn't
    // rendered as page text anywhere in app/ or components/ (it only exists
    // as a description string in components/application/launch-checklist.tsx).
    // Flagging rather than deleting, so a future implementation of this
    // readiness target has a test ready to un-skip.
    test.fail(true, "GET /app/communications ignores ?view=readiness and never renders \"Communications Hub\" — see comment above.");

    await page.goto("/app/communications?view=readiness");
    expect(new URL(page.url()).pathname).not.toBe("/sign-in");
    await expect(page.getByText("Communications Hub", { exact: false }).first()).toBeVisible();
    await expect(page.locator("[data-testid^='readiness-target-state-']")).toBeVisible();
  });
});

test.describe("ChurchAdmin readiness denied-role browser path", () => {
  const deniedIdentities = ["secretary", "member", "pastor", "ministry-leader"] as const;

  for (const identity of deniedIdentities) {
    test.describe(identity, () => {
      test.use({ storageState: authFilePath(identity) });

      test(`redirects ${identity} away from ChurchAdmin-only readiness routes`, async ({ page }) => {
        for (const target of churchAdminOnlyReadinessRoutes) {
          const { route, deniedText } = target;
          if ("alsoAllowed" in target && (target.alsoAllowed as readonly string[]).includes(identity)) continue;
          const deniedPath = new URL(route, "http://placeholder").pathname;
          await page.goto(route);
          // The denial redirect can arrive as a streamed NEXT_REDIRECT applied
          // on hydration; until it lands, the shell (nav labels included) is on
          // screen. Wait for it before asserting the protected content is gone.
          await page.waitForURL((url) => url.pathname !== deniedPath, { timeout: 15_000 });
          await expect(page.getByRole("heading", { name: "Weekly readiness" })).toHaveCount(0);
          await expect(page.getByText(deniedText, { exact: false })).toHaveCount(0);
        }
      });
    });
  }
});
