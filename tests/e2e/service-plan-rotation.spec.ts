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
 *
 * It also covers the public volunteer links (G1.4) with a real token: the
 * accept/decline page and the schedule page (both errored on every load
 * before G1.4), and a volunteer marking a date unavailable through their
 * link, after which auto-fill no longer proposes them. These live in this
 * file, not their own, so they run serially with the auto-fill journey and
 * can't race it over the same volunteers and plan.
 */
import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { queryTenantDb } from "./fixtures/api";
import { authFilePath } from "./fixtures/roles";

const PLAN_ID = "b2b2b2b2-0000-0000-0000-000000000001";
const WORSHIP_LEADER_POSITION_ID = "b3b3b3b3-0000-0000-0000-000000000001";
const PLAN_PATH = `/app/church-admin/volunteers/schedules/${PLAN_ID}`;
// Marks the shifts and blockouts this spec creates, so cleanup never touches seed data.
const E2E_REASON = "e2e-rotation-spec";

async function profileIdByEmail(email: string) {
  const res = await queryTenantDb<{ id: string }>(`select id from public.profiles where email = $1`, [email]);
  return res.rows[0].id;
}

/**
 * Creates a pending shift with a valid emailed-link token for a volunteer, on
 * a date well clear of the plan (60 days after it: outside its 30-day load
 * window and in a different month), and returns the token.
 */
async function createLinkShift(profileId: string, title: string) {
  const token = `e2e-${randomUUID()}`;
  await queryTenantDb(
    `insert into public.volunteer_shifts
       (church_id, event_id, assigned_user_id, title, starts_at, ends_at, status, confirmation_status,
        confirmation_token, confirmation_token_expires_at, volunteer_notes)
     select sp.church_id, sp.event_id, $2, $3,
            (sp.service_date + 60)::timestamp + interval '9 hours',
            (sp.service_date + 60)::timestamp + interval '11 hours',
            'assigned', 'pending', $4, now() + interval '7 days', $5
     from public.service_plans sp where sp.id = $1`,
    [PLAN_ID, profileId, title, token, E2E_REASON],
  );
  return token;
}

async function cleanUp() {
  await queryTenantDb(`delete from public.volunteer_shifts where plan_id = $1 or volunteer_notes = $2`, [PLAN_ID, E2E_REASON]);
  await queryTenantDb(`delete from public.volunteer_blocked_dates where reason = $1`, [E2E_REASON]);
}

test.describe("Service plan rotation planner", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: authFilePath("church-admin") });

  test.beforeEach(cleanUp);
  test.afterAll(cleanUp);

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

  test("a volunteer confirms a shift from their emailed link", async ({ page }) => {
    const token = await createLinkShift(await profileIdByEmail("samuel@graceharbor.church"), "E2E Usher");

    await page.goto(`/portal/volunteer/confirm/${token}`);
    // Wait for streaming to finish: until then Next keeps a hidden copy of the
    // content outside <main>, which a strict locator would count twice.
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "E2E Usher" })).toHaveCount(1);
    await expect(page.getByRole("heading", { name: "E2E Usher" })).toBeVisible();
    await page.getByRole("button", { name: "Confirm" }).click();

    await expect(page.getByText("confirmed", { exact: true })).toBeVisible();
    const res = await queryTenantDb<{ confirmation_status: string }>(
      `select confirmation_status from public.volunteer_shifts where confirmation_token = $1`,
      [token],
    );
    expect(res.rows[0].confirmation_status).toBe("confirmed");
  });

  test("a volunteer marks the service date unavailable from their schedule link, and auto-fill skips them", async ({ page }) => {
    const token = await createLinkShift(await profileIdByEmail("maya@graceharbor.church"), "E2E Greeter");
    const planDate = (
      await queryTenantDb<{ d: string }>(`select service_date::text as d from public.service_plans where id = $1`, [PLAN_ID])
    ).rows[0].d;

    // The schedule link lists the volunteer's shifts (it errored on every load before G1.4).
    await page.goto(`/portal/volunteer/schedule/${token}`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("main").getByText("E2E Greeter")).toBeVisible();

    const panel = page.getByTestId("blockout-dates");
    await panel.getByLabel(/^From/).fill(planDate);
    await panel.getByLabel("Reason (optional)").fill(E2E_REASON);
    await panel.getByRole("button", { name: "Add" }).click();
    await expect(panel.getByRole("button", { name: /^Remove / })).toHaveCount(1);

    // Auto-fill no longer proposes Maya for the plan she's now away for.
    await page.goto(PLAN_PATH);
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Auto-fill plan" }).click();
    const proposal = page.getByTestId("auto-fill-proposal");
    await expect(proposal.getByText("Samuel Price")).toBeVisible();
    await expect(proposal.getByText("Maya Martinez")).toHaveCount(0);
  });
});
