/**
 * Member self-service journeys, as a real signed-in member (S7).
 *
 * The session's `profile.id` is the member's auth (login) user id, which is
 * never their church profiles.id. Every "act as myself" path used it anyway,
 * so a member's own schedule was always empty, they couldn't confirm or
 * decline in-app, and they couldn't save unavailable dates. These journeys
 * pin the fix (`session.churchProfileId`) end to end.
 *
 * The spec creates its own plan and shift (not the rotation spec's seeded
 * plan), so it can run alongside other specs, and cleans up after itself.
 */
import { expect, test } from "@playwright/test";

import { queryTenantDb } from "./fixtures/api";
import { authFilePath } from "./fixtures/roles";

const MEMBER_EMAIL = "david@graceharbor.church";
const MARK = "e2e-member-self-service";
const PLAN_NAME = "E2E Member Self-Service Plan";

async function memberProfileId() {
  const res = await queryTenantDb<{ id: string }>(`select id from public.profiles where email = $1`, [MEMBER_EMAIL]);
  return res.rows[0].id;
}

async function cleanUp() {
  await queryTenantDb(`delete from public.volunteer_shifts where volunteer_notes = $1`, [MARK]);
  await queryTenantDb(`delete from public.service_plans where name = $1`, [PLAN_NAME]);
  await queryTenantDb(`delete from public.volunteer_blocked_dates where reason = $1`, [MARK]);
}

test.describe("Member self-service (S7)", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: authFilePath("member") });

  test.beforeEach(cleanUp);
  test.afterAll(cleanUp);

  test("My Schedule shows the member's own shift, and they can confirm it", async ({ page }) => {
    const profileId = await memberProfileId();
    // A plan 20 days out, on the church's existing Sunday event.
    const shift = await queryTenantDb<{ id: string }>(
      `with plan as (
         insert into public.service_plans (church_id, name, service_date, service_time, status, event_id)
         select church_id, $2, current_date + 20, '10:00', 'published', event_id
         from public.service_plans where event_id is not null limit 1
         returning id, church_id, event_id, service_date
       )
       insert into public.volunteer_shifts
         (church_id, event_id, plan_id, assigned_user_id, title, starts_at, ends_at, status, confirmation_status, volunteer_notes)
       select church_id, event_id, id, $1, 'Usher',
              service_date + time '10:00', service_date + time '12:00', 'assigned', 'pending', $3
       from plan
       returning id`,
      [profileId, PLAN_NAME, MARK],
    );

    await page.goto("/app/member/schedule");
    await page.waitForLoadState("networkidle");
    const main = page.getByRole("main");
    await expect(main.getByText(PLAN_NAME)).toBeVisible();

    // Scoped to this spec's shift card: member-phone-first.spec.ts gives the same member
    // its own pending shift, and the two specs can run in parallel in one shard.
    await main
      .locator(".mantine-Paper-root", { hasText: PLAN_NAME })
      .last()
      .getByRole("button", { name: "Confirm" })
      .click();
    await expect
      .poll(async () =>
        (await queryTenantDb<{ s: string }>(`select confirmation_status as s from public.volunteer_shifts where id = $1`, [shift.rows[0].id]))
          .rows[0].s,
      )
      .toBe("confirmed");
  });

  test("a member can save an unavailable date, recorded against their church profile", async ({ page }) => {
    const profileId = await memberProfileId();
    const day = (await queryTenantDb<{ d: string }>(`select (current_date + 45)::text as d`)).rows[0].d;

    await page.goto("/app/member/schedule");
    await page.waitForLoadState("networkidle");
    const panel = page.getByTestId("blockout-dates");
    await panel.getByLabel(/^First day/).fill(day);
    await panel.getByLabel("Reason (optional)").fill(MARK);
    await panel.getByRole("button", { name: "Add" }).click();
    await expect(panel.getByRole("status")).toHaveText("Saved.");

    const rows = await queryTenantDb<{ profile_id: string }>(
      `select profile_id from public.volunteer_blocked_dates where reason = $1`,
      [MARK],
    );
    expect(rows.rows).toEqual([{ profile_id: profileId }]);
  });
});
