/**
 * Phone-first member pages (G2.1) at 390x844 and 360x780: home, schedule,
 * giving and family have no horizontal scroll, every control in the content
 * is at least 44x44, content cards stack in one column, and the primary action
 * is visible in the first screen between the header and the bottom nav. Also
 * the /app/calendar heading and the service-plan stat tiles on a phone.
 *
 * The schedule page needs a shift for the member; the seed has none, so this
 * spec inserts one (marked, deleted afterwards). member-self-service.spec.ts
 * also gives the member a shift, so the schedule checks do not assume an
 * empty list: they hold for any list the member has.
 */
import { expect, test } from "@playwright/test";

import { queryTenantDb } from "./fixtures/api";
import {
  collectTouchViolations,
  expectBottomNavTouchable,
  expectNoHorizontalOverflow,
  expectPrimaryActionInFirstScreen,
  findSideBySideCards,
} from "./fixtures/mobile-layout";
import { authFilePath } from "./fixtures/roles";

const MEMBER_EMAIL = "david@graceharbor.church";
const MARK = "e2e-phone-first-spec";
const PLAN_ID = "b2b2b2b2-0000-0000-0000-000000000001";

const PAGES = [
  { name: "home", path: "/app/member", hasCurrentNavItem: true },
  { name: "schedule", path: "/app/member/schedule", hasCurrentNavItem: true },
  { name: "giving", path: "/app/member/giving", hasCurrentNavItem: false },
  { name: "family", path: "/app/member/family", hasCurrentNavItem: true },
] as const;

async function addPendingShift() {
  const profile = await queryTenantDb<{ id: string }>(`select id from public.profiles where email = $1`, [MEMBER_EMAIL]);
  await queryTenantDb(
    `insert into public.volunteer_shifts
       (church_id, event_id, assigned_user_id, title, starts_at, ends_at, status, confirmation_status, volunteer_notes)
     select sp.church_id, sp.event_id, $2, 'Phone Greeter',
            date_trunc('day', now()) + interval '30 days 9 hours',
            date_trunc('day', now()) + interval '30 days 11 hours',
            'assigned', 'pending', $3
     from public.service_plans sp where sp.id = $1`,
    [PLAN_ID, profile.rows[0].id, MARK],
  );
}

async function cleanUp() {
  await queryTenantDb(`delete from public.volunteer_shifts where volunteer_notes = $1`, [MARK]);
}

test.describe("Member pages on a phone", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: authFilePath("member"), viewport: { width: 390, height: 844 } });

  test.beforeAll(async () => {
    await cleanUp();
    await addPendingShift();
  });
  test.afterAll(cleanUp);

  for (const route of PAGES) {
    test(`${route.name}: no overflow, 44px targets, one column, primary action in the first screen`, async ({ page }) => {
      await page.goto(route.path);
      await page.waitForLoadState("networkidle");
      await expect(page.getByText("Application error", { exact: false })).toHaveCount(0);

      await expectNoHorizontalOverflow(page);
      expect(await collectTouchViolations(page), "controls under 44x44").toEqual([]);
      expect(await findSideBySideCards(page), "cards side by side").toEqual([]);
      await expectBottomNavTouchable(page, { hasCurrentItem: route.hasCurrentNavItem });
      await expectPrimaryActionInFirstScreen(page);
    });

    test(`${route.name}: no overflow at 360px`, async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 780 });
      await page.goto(route.path);
      await expectNoHorizontalOverflow(page);
    });
  }

  test("schedule: Confirm and Decline are full-size and the pending shift's Confirm is the primary action", async ({ page }) => {
    await page.goto("/app/member/schedule");
    const confirm = page.getByRole("button", { name: "Confirm" }).first();
    await expect(confirm).toBeVisible();
    const box = await confirm.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(43.5);
    await expect(confirm).toHaveAttribute("data-primary-action", "true");
    await expect(page.getByRole("button", { name: "Decline" }).first()).toBeVisible();
  });

  test("schedule: the unavailable-dates Add button is reachable", async ({ page }) => {
    await page.goto("/app/member/schedule");
    const add = page.locator("main button[data-primary-action]").last();
    await expect(add).toBeVisible();
    const box = await add.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(43.5);
  });

  test("calendar has a real Calendar heading and keeps the bottom nav", async ({ page }) => {
    await page.goto("/app/calendar");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "Calendar", exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectBottomNavTouchable(page);
  });
});

test.describe("Service plan stat tiles", () => {
  test.use({ storageState: authFilePath("church-admin") });
  const path = `/app/church-admin/volunteers/schedules/${PLAN_ID}`;

  async function tiles(page: import("@playwright/test").Page) {
    const labels = ["Unfilled", "Pending response", "Confirmed"];
    const boxes = [];
    for (const label of labels) {
      const tile = page.locator("main .mantine-Paper-root", { has: page.getByText(label, { exact: true }) }).last();
      await expect(tile).toBeVisible();
      boxes.push((await tile.boundingBox())!);
    }
    return boxes;
  }

  test("stack in one column on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const [a, b, c] = await tiles(page);
    expect(Math.abs(a.x - b.x)).toBeLessThan(2);
    expect(Math.abs(b.x - c.x)).toBeLessThan(2);
    expect(b.y).toBeGreaterThan(a.y);
    expect(c.y).toBeGreaterThan(b.y);
  });

  test("sit three across on a desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const [a, b, c] = await tiles(page);
    expect(Math.abs(a.y - b.y)).toBeLessThan(2);
    expect(Math.abs(b.y - c.y)).toBeLessThan(2);
    expect(b.x).toBeGreaterThan(a.x);
    expect(c.x).toBeGreaterThan(b.x);
  });
});
