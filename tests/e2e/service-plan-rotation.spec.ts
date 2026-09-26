/**
 * Service Planning Story 3 (rotation planner) journey, against the plan
 * seeded for it in supabase/seed.sql ("Sunday Worship", draft):
 *
 *   open the plan → ranked suggestions for a position → auto-fill the plan →
 *   apply → the team roster is filled.
 *
 * The seed is built so the correct fill is known (see the "reproduces the
 * seeded demo scenario" test in lib/rotation-planner.test.ts): Marcus is at
 * the burnout threshold, Carlos is at his monthly limit, Elena is blocked on
 * the date, and James led worship recently, so the fill is Aisha (Worship
 * Leader), Grace (Sound Tech), then Maya and Samuel (Greeters).
 *
 * This spec writes shifts, so it first deletes any shifts on the plan; that
 * makes it safe to retry and to re-run against a long-lived local database.
 */
import { expect, test } from "@playwright/test";

import { queryTenantDb } from "./fixtures/api";
import { authFilePath } from "./fixtures/roles";

const PLAN_ID = "b2b2b2b2-0000-0000-0000-000000000001";
const WORSHIP_LEADER_POSITION_ID = "b3b3b3b3-0000-0000-0000-000000000001";
const PLAN_PATH = `/app/church-admin/volunteers/schedules/${PLAN_ID}`;

test.describe("Service plan rotation planner", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: authFilePath("church-admin") });

  test.beforeEach(async () => {
    await queryTenantDb(`delete from public.volunteer_shifts where plan_id = $1`, [PLAN_ID]);
  });

  test("suggests rested, skilled volunteers and auto-fills the plan", async ({ page }) => {
    await page.goto(PLAN_PATH);
    await page.waitForLoadState("networkidle");

    // 1. Ranked suggestions for one position.
    const worshipLeader = page.getByTestId(`plan-position-${WORSHIP_LEADER_POSITION_ID}`);
    await worshipLeader.getByRole("button", { name: "Assign" }).click();
    const suggested = page.getByTestId("suggested-volunteers");
    await expect(suggested).toBeVisible();
    await expect(suggested.getByText("Aisha Thompson")).toBeVisible();
    await expect(suggested.getByText("2/2 skills").first()).toBeVisible();
    // Aisha has never served, so she ranks above James, who led worship recently.
    const firstSuggestion = suggested.locator("p").first();
    await expect(firstSuggestion).toHaveText("Aisha Thompson");
    await page.keyboard.press("Escape");
    await expect(suggested).toBeHidden();

    // 2. Auto-fill proposes the known-correct fill.
    await page.getByRole("button", { name: "Auto-fill plan" }).click();
    const proposal = page.getByTestId("auto-fill-proposal");
    await expect(proposal).toBeVisible();
    for (const name of ["Aisha Thompson", "Grace Adeyemi", "Maya Martinez", "Samuel Price"]) {
      await expect(proposal.getByText(name)).toBeVisible();
    }
    for (const excluded of ["Marcus Williams", "Carlos Martinez", "Elena Martinez"]) {
      await expect(proposal.getByText(excluded)).toHaveCount(0);
    }

    // 3. Apply: every proposed assignment succeeds.
    await page.getByRole("button", { name: "Apply 4 assignments" }).click();
    await expect(proposal.getByText("Assigned", { exact: true })).toHaveCount(4);
    await expect(proposal.getByText("Not assigned")).toHaveCount(0);

    // 4. The roster reflects it after the page reloads, and nothing is left to fill.
    await page.getByRole("button", { name: "Done" }).click();
    await page.waitForLoadState("networkidle");
    const roster = page.getByTestId("team-roster");
    for (const name of ["Aisha Thompson", "Grace Adeyemi", "Maya Martinez", "Samuel Price"]) {
      await expect(roster.getByRole("table").getByText(name)).toBeVisible();
    }
    await expect(page.getByRole("button", { name: "Auto-fill plan" })).toHaveCount(0);

    // Every shift got a valid window (ends after it starts), which the
    // old inline assignment code violated whenever a plan had a service time.
    const shifts = await queryTenantDb<{ count: string }>(
      `select count(*) from public.volunteer_shifts where plan_id = $1 and ends_at > starts_at`,
      [PLAN_ID],
    );
    expect(Number(shifts.rows[0].count)).toBe(4);
  });
});
